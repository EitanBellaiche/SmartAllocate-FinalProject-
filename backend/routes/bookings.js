import express from "express";
import pool from "../db.js";
import { evaluateRules } from "../rulesEngine.js";

const router = express.Router();
let tableReady = false;

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

async function ensureTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_cancellations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      cancelled_reason TEXT,
      cancelled_by TEXT,
      cancelled_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_locations (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      location TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      course_name TEXT,
      sender_name TEXT,
      target_user_id TEXT,
      organization_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS course_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sender_name TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_user_id TEXT`);
  await pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS organization_id TEXT`);
  tableReady = true;
}

router.use(async (req, res, next) => {
  try {
    await ensureTables();
    next();
  } catch (err) {
    console.error("Failed to init booking tables:", err);
    res.status(500).json({ error: "Booking service unavailable" });
  }
});

// GET bookings (optional filter by resource_id)
router.get("/", async (req, res) => {
  try {
    const { resource_id, include_details, user_id, national_id } = req.query;
    const orgId = getOrgId(req);
    const params = [];
    const conditions = [];
    const wantsDetails = include_details === "1" || include_details === "true";

    if (resource_id) {
      params.push(Number(resource_id));
      if (!Number.isFinite(params[0])) {
        return res.status(400).json({ error: "Invalid resource_id" });
      }
      conditions.push(`r.id = $${params.length}`);
    }

    const userIdValue = String(user_id || national_id || "").trim();
    if (userIdValue) {
      params.push(userIdValue);
      conditions.push(`b.user_id::text = $${params.length}`);
    }

    if (orgId) {
      params.push(orgId);
      conditions.push(`r.organization_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        bc.cancelled_at,
        bc.cancelled_reason,
        bc.cancelled_by,
        bl.location,
        json_agg(
          json_build_object(
            'id', r.id,
            'name', r.name,
            'type_id', r.type_id,
            'type_name', rt.name,
            'metadata', r.metadata,
            'role', br.role
          )
          ORDER BY r.id
        ) AS resources
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      LEFT JOIN booking_locations bl ON bl.booking_id = b.id
      ${where}
      GROUP BY b.id, bc.cancelled_at, bc.cancelled_reason, bc.cancelled_by, bl.location
      ORDER BY b.date ASC, b.start_time ASC, b.id ASC
      `,
      params
    );

    if (!wantsDetails) {
      const compact = rows.map((row) => ({
        ...row,
        resources: (row.resources || []).map((r) => ({
          id: r.id,
          name: r.name,
          type_id: r.type_id,
          role: r.role,
        })),
      }));
      return res.json(compact);
    }

    return res.json(rows);
  } catch (err) {
    console.error("Error getting bookings:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  const senderName = String(req.body?.sender_name || "Lecturer").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params = [id];
    let where = "WHERE b.id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE b.id = $1 AND r.organization_id = $2";
    }
    const { rows: bookingRows } = await client.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        r.id AS resource_id,
        r.name AS resource_name,
        r.metadata AS resource_metadata,
        rt.name AS type_name
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      ${where}
      `,
      params
    );

    if (bookingRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const { rows: existing } = await client.query(
      `SELECT id FROM booking_cancellations WHERE booking_id = $1`,
      [id]
    );
    if (existing.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Booking already cancelled" });
    }

    const courseNames = bookingRows
      .filter((r) => {
        const type = String(r.type_name || "").toLowerCase();
        return type === "courses" || type === "course";
      })
      .map((r) => r.resource_name)
      .filter(Boolean);
    const fallbackNames = bookingRows
      .map((r) => r.resource_name)
      .filter(Boolean);
    const courseLabel = courseNames.length > 0 ? courseNames.join(" / ") : fallbackNames.join(" / ");
    const booking = bookingRows[0];

    const resourceIds = bookingRows.map((r) => r.resource_id).filter(Boolean);
    const courseResourceIds = bookingRows
      .filter((r) => {
        const type = String(r.type_name || "").toLowerCase();
        return type === "courses" || type === "course";
      })
      .map((r) => r.resource_id)
      .filter(Boolean);
    const metadataStudentIds = bookingRows
      .filter((r) => {
        const type = String(r.type_name || "").toLowerCase();
        return type === "courses" || type === "course";
      })
      .flatMap((r) => {
        const raw = r.resource_metadata;
        if (!raw) return [];
        let meta = raw;
        if (typeof raw === "string") {
          try {
            meta = JSON.parse(raw);
          } catch {
            return [];
          }
        }
        const ids = meta?.student_ids || meta?.studentIds || meta?.user_ids || meta?.userIds || [];
        if (Array.isArray(ids)) return ids;
        if (typeof ids === "string") {
          return ids.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
        }
        return [];
      })
      .map((id) => String(id).trim())
      .filter(Boolean);
    let targetBookings = [{ id: booking.id, user_id: booking.user_id }];
    if (resourceIds.length > 0) {
      const targetParams = [
        resourceIds,
        booking.date,
        booking.start_time,
        booking.end_time,
        resourceIds.length,
      ];
      let targetOrg = "";
      if (orgId) {
        targetParams.push(orgId);
        targetOrg = `AND r.organization_id = $${targetParams.length}`;
      }
      const { rows: targetRows } = await client.query(
        `
        SELECT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE br.resource_id = ANY($1)
        AND b.date = $2
        AND b.start_time = $3
        AND b.end_time = $4
        ${targetOrg}
        GROUP BY b.id, b.user_id
        HAVING COUNT(DISTINCT br.resource_id) = $5
           AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($1) THEN br.resource_id END) = $5
        `,
        targetParams
      );
      if (targetRows.length > 0) {
        targetBookings = targetRows;
      } else if (orgId) {
        const retryParams = [
          resourceIds,
          booking.date,
          booking.start_time,
          booking.end_time,
          resourceIds.length,
        ];
        const { rows: retryRows } = await client.query(
          `
          SELECT b.id, b.user_id
          FROM bookings b
          JOIN booking_resources br ON br.booking_id = b.id
          JOIN resources r ON r.id = br.resource_id
          WHERE br.resource_id = ANY($1)
          AND b.date = $2
          AND b.start_time = $3
          AND b.end_time = $4
          GROUP BY b.id, b.user_id
          HAVING COUNT(DISTINCT br.resource_id) = $5
             AND COUNT(DISTINCT CASE WHEN br.resource_id = ANY($1) THEN br.resource_id END) = $5
          `,
          retryParams
        );
        if (retryRows.length > 0) {
          targetBookings = retryRows;
        }
      }

      if (targetBookings.length === 1 && courseResourceIds.length > 0) {
        const fallbackParams = [
          courseResourceIds,
          booking.date,
          booking.start_time,
          booking.end_time,
        ];
        let fallbackOrg = "";
        if (orgId) {
          fallbackParams.push(orgId);
          fallbackOrg = `AND r.organization_id = $${fallbackParams.length}`;
        }
        const { rows: fallbackRows } = await client.query(
          `
          SELECT DISTINCT b.id, b.user_id
          FROM bookings b
          JOIN booking_resources br ON br.booking_id = b.id
          JOIN resources r ON r.id = br.resource_id
          WHERE br.resource_id = ANY($1)
          AND b.date = $2
          AND b.start_time = $3
          AND b.end_time = $4
          ${fallbackOrg}
          `,
          fallbackParams
        );
        if (fallbackRows.length > 0) {
          targetBookings = fallbackRows;
        } else if (orgId) {
          const retryFallbackParams = [
            courseResourceIds,
            booking.date,
            booking.start_time,
            booking.end_time,
          ];
          const { rows: retryFallbackRows } = await client.query(
            `
            SELECT DISTINCT b.id, b.user_id
            FROM bookings b
            JOIN booking_resources br ON br.booking_id = b.id
            JOIN resources r ON r.id = br.resource_id
            WHERE br.resource_id = ANY($1)
            AND b.date = $2
            AND b.start_time = $3
            AND b.end_time = $4
            `,
            retryFallbackParams
          );
          if (retryFallbackRows.length > 0) {
            targetBookings = retryFallbackRows;
          }
        }
      }
    }

    const extraStudentIds = Array.from(
      new Set(
        metadataStudentIds
          .filter((id) => id && id !== String(booking.user_id || "").trim())
      )
    );
    if (extraStudentIds.length > 0 && courseResourceIds.length > 0) {
      const extraParams = [
        extraStudentIds,
        courseResourceIds,
        booking.date,
        booking.start_time,
        booking.end_time,
      ];
      let extraOrg = "";
      if (orgId) {
        extraParams.push(orgId);
        extraOrg = `AND r.organization_id = $${extraParams.length}`;
      }
      const { rows: extraRows } = await client.query(
        `
        SELECT DISTINCT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE b.user_id = ANY($1)
        AND br.resource_id = ANY($2)
        AND b.date = $3
        AND b.start_time = $4
        AND b.end_time = $5
        ${extraOrg}
        `,
        extraParams
      );
      if (extraRows.length > 0) {
        const combined = new Map(targetBookings.map((t) => [t.id, t]));
        extraRows.forEach((row) => {
          if (!combined.has(row.id)) combined.set(row.id, row);
        });
        targetBookings = Array.from(combined.values());
      }
    }

    for (const target of targetBookings) {
      await client.query(
        `
        INSERT INTO booking_cancellations (booking_id, cancelled_reason, cancelled_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (booking_id) DO NOTHING
        `,
        [target.id, reason || null, senderName || null]
      );
    }

    const baseMessage = `Class cancelled: ${courseLabel} on ${booking.date} ${booking.start_time} - ${booking.end_time}.`;
    const message = reason ? `${baseMessage} Reason: ${reason}.` : baseMessage;
    const recipientSet = new Set(
      targetBookings
        .map((target) => String(target.user_id || ""))
        .filter(Boolean)
    );
    if (recipientSet.size === 0 && targetUserId) {
      recipientSet.add(targetUserId);
    }
    for (const recipient of recipientSet) {
      await client.query(
        `
        INSERT INTO announcements (title, message, course_name, sender_name, target_user_id, organization_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        ["Class cancelled", message, courseLabel || null, senderName || null, recipient, orgId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error cancelling booking:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  } finally {
    client.release();
  }
});

router.post("/:id/reschedule", async (req, res) => {
  const id = Number(req.params.id);
  const date = String(req.body?.date || "").trim();
  const startTime = String(req.body?.start_time || "").trim();
  const endTime = String(req.body?.end_time || "").trim();
  const location = String(req.body?.location || "classroom").trim().toLowerCase();
  const reason = String(req.body?.reason || "").trim();
  const senderName = String(req.body?.sender_name || "Lecturer").trim();
  const targetUserIdRaw = String(req.body?.target_user_id || "").trim();
  const targetUserId = targetUserIdRaw || null;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "Invalid booking id" });
  }
  if (!date || !startTime || !endTime) {
    return res.status(400).json({ error: "Date and time are required" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params = [id];
    let where = "WHERE b.id = $1";
    if (orgId) {
      params.push(orgId);
      where = "WHERE b.id = $1 AND r.organization_id = $2";
    }
    const { rows: bookingRows } = await client.query(
      `
      SELECT
        b.id,
        b.date,
        b.start_time,
        b.end_time,
        b.user_id,
        r.id AS resource_id,
        r.name AS resource_name,
        rt.name AS type_name
      FROM bookings b
      JOIN booking_resources br ON br.booking_id = b.id
      JOIN resources r ON r.id = br.resource_id
      JOIN resource_types rt ON rt.id = r.type_id
      ${where}
      `,
      params
    );

    if (bookingRows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingRows[0];

    const resourceIds = bookingRows.map((r) => r.resource_id);
    const conflictCheck = await client.query(
      `
      SELECT br.resource_id, b.*
      FROM booking_resources br
      JOIN bookings b ON b.id = br.booking_id
      LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
      WHERE br.resource_id = ANY($1)
      AND b.date = $2
      AND b.id <> $5
      AND bc.booking_id IS NULL
      AND (
        ($3 >= b.start_time AND $3 < b.end_time) OR
        ($4 > b.start_time AND $4 <= b.end_time) OR
        ($3 <= b.start_time AND $4 >= b.end_time)
      )
    `,
      [resourceIds, date, startTime, endTime, id]
    );

    if (conflictCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Resources conflict" });
    }

    const courseResourceIds = bookingRows
      .filter((r) => {
        const type = String(r.type_name || "").toLowerCase();
        return type === "courses" || type === "course";
      })
      .map((r) => r.resource_id);

    let targetBookings = [{ id: booking.id, user_id: booking.user_id }];
    if (courseResourceIds.length > 0) {
      const targetParams = [
        courseResourceIds,
        booking.date,
        booking.start_time,
        booking.end_time,
      ];
      let targetOrg = "";
      if (orgId) {
        targetParams.push(orgId);
        targetOrg = `AND r.organization_id = $${targetParams.length}`;
      }
      const { rows: targetRows } = await client.query(
        `
        SELECT DISTINCT b.id, b.user_id
        FROM bookings b
        JOIN booking_resources br ON br.booking_id = b.id
        JOIN resources r ON r.id = br.resource_id
        WHERE br.resource_id = ANY($1)
        AND b.date = $2
        AND b.start_time = $3
        AND b.end_time = $4
        ${targetOrg}
        `,
        targetParams
      );
      if (targetRows.length > 0) {
        targetBookings = targetRows;
      }
    }

    const targetIds = targetBookings.map((target) => target.id);
    await client.query(
      `DELETE FROM booking_cancellations WHERE booking_id = ANY($1)`,
      [targetIds]
    );
    await client.query(
      `
      UPDATE bookings
      SET date = $1, start_time = $2, end_time = $3
      WHERE id = ANY($4)
      `,
      [date, startTime, endTime, targetIds]
    );

    if (location === "zoom") {
      for (const bookingId of targetIds) {
        await client.query(
          `
          INSERT INTO booking_locations (booking_id, location)
          VALUES ($1, $2)
          ON CONFLICT (booking_id) DO UPDATE
          SET location = EXCLUDED.location, updated_at = NOW()
          `,
          [bookingId, "zoom"]
        );
      }
    } else {
      await client.query(`DELETE FROM booking_locations WHERE booking_id = ANY($1)`, [targetIds]);
    }

    const courseNames = bookingRows
      .filter((r) => {
        const type = String(r.type_name || "").toLowerCase();
        return type === "courses" || type === "course";
      })
      .map((r) => r.resource_name)
      .filter(Boolean);
    const fallbackNames = bookingRows
      .map((r) => r.resource_name)
      .filter(Boolean);
    const courseLabel = courseNames.length > 0 ? courseNames.join(" / ") : fallbackNames.join(" / ");
    const locationLabel = location === "zoom" ? "Zoom" : "Classroom";
    const baseMessage = `Class rescheduled: ${courseLabel} moved from ${booking.date} ${booking.start_time} - ${booking.end_time} to ${date} ${startTime} - ${endTime}.`;
    const message = reason
      ? `${baseMessage} Reason: ${reason}. Location: ${locationLabel}.`
      : `${baseMessage} Location: ${locationLabel}.`;

    const recipientSet = new Set(
      targetBookings
        .map((target) => String(target.user_id || ""))
        .filter(Boolean)
    );
    if (recipientSet.size === 0 && targetUserId) {
      recipientSet.add(targetUserId);
    }
    for (const recipient of recipientSet) {
      await client.query(
        `
        INSERT INTO announcements (title, message, course_name, sender_name, target_user_id, organization_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        ["Class rescheduled", message, courseLabel || null, senderName || null, recipient, orgId]
      );
    }

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error rescheduling booking:", err);
    res.status(500).json({ error: "Failed to reschedule booking" });
  } finally {
    client.release();
  }
});

/* -----------------------------
   CREATE BOOKING WITH RESOURCES
--------------------------------*/
router.post("/", async (req, res) => {
  const {
    resources,
    roles,
    date,
    start_time,
    end_time,
    user_id,
    recurrence,
  } = req.body;
  const orgId = getOrgId(req);

  if (!resources || resources.length === 0) {
    return res.status(400).json({ error: "No resources provided" });
  }

  const client = await pool.connect();

  try {
    const parseDate = (value) => {
      if (!value || typeof value !== "string") return null;
      const parts = value.split("-");
      if (parts.length !== 3) return null;
      const [y, m, d] = parts.map((p) => Number(p));
      if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
        return null;
      }
      return new Date(y, m - 1, d);
    };
    const formatDate = (dateObj) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    let bookingDates = [];
    if (recurrence) {
      const startDateValue = String(recurrence?.start_date || "").trim();
      const endDateValue = String(recurrence?.end_date || "").trim();
      const days = Array.isArray(recurrence?.days_of_week)
        ? recurrence.days_of_week
        : [];
      const daysOfWeek = days
        .map((d) => Number(d))
        .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);

      if (!startDateValue || !endDateValue || daysOfWeek.length === 0) {
        return res.status(400).json({
          error: "Recurrence requires start_date, end_date, and days_of_week",
        });
      }
      const startDate = parseDate(startDateValue);
      const endDate = parseDate(endDateValue);
      if (!startDate || !endDate || startDate > endDate) {
        return res.status(400).json({ error: "Invalid recurrence date range" });
      }

      const uniqueDays = Array.from(new Set(daysOfWeek));
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (uniqueDays.includes(d.getDay())) {
          bookingDates.push(formatDate(d));
        }
        if (bookingDates.length > 200) {
          return res.status(400).json({
            error: "Recurrence creates too many bookings",
          });
        }
      }

      if (bookingDates.length === 0) {
        return res.status(400).json({
          error: "No dates match the selected recurrence",
        });
      }
    } else {
      const dateValue = String(date || "").trim();
      if (!dateValue) {
        return res.status(400).json({ error: "Date is required" });
      }
      bookingDates = [dateValue];
    }

    await client.query("BEGIN");

    const roleMap = roles && typeof roles === "object" ? roles : {};
    const responsibleResources = resources.filter((rid) => {
      const roleValue = String(roleMap?.[rid] || "").toLowerCase();
      return roleValue === "responsible";
    });
    /* 2. Load resources + rules for evaluation */
    const resourceParams = [resources];
    let resourceWhere = "WHERE r.id = ANY($1)";
    if (orgId) {
      resourceParams.push(orgId);
      resourceWhere = "WHERE r.id = ANY($1) AND r.organization_id = $2";
    }
    const { rows: resourceRows } = await client.query(
      `
      SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
      FROM resources r
      JOIN resource_types rt ON rt.id = r.type_id
      ${resourceWhere}
      `,
      resourceParams
    );

    if (resourceRows.length !== resources.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const ruleParams = [];
    let ruleWhere = "WHERE is_active = true";
    if (orgId) {
      ruleParams.push(orgId);
      ruleWhere += ` AND organization_id = $${ruleParams.length}`;
    }
    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
      ruleParams
    );

    const createdBookings = [];
    let lastRuleEval = null;
    for (const bookingDate of bookingDates) {
      /* 1. Check availability for responsible roles only */
      if (responsibleResources.length > 0) {
        const conflictParams = [responsibleResources, bookingDate, start_time, end_time];
        let conflictOrg = "";
        if (orgId) {
          conflictParams.push(orgId);
          conflictOrg = `AND r.organization_id = $${conflictParams.length}`;
        }
        const conflictCheck = await client.query(
          `
          SELECT br.resource_id, br.role, b.*
          FROM booking_resources br
          JOIN bookings b ON b.id = br.booking_id
          JOIN resources r ON r.id = br.resource_id
          LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
          WHERE br.resource_id = ANY($1)
          AND LOWER(COALESCE(br.role, '')) = 'responsible'
          AND b.date = $2
          AND bc.booking_id IS NULL
          ${conflictOrg}
          AND (
            ($3 >= b.start_time AND $3 < b.end_time) OR
            ($4 > b.start_time AND $4 <= b.end_time) OR
            ($3 <= b.start_time AND $4 >= b.end_time)
          )
        `,
          conflictParams
        );

        if (conflictCheck.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Resources conflict",
            date: bookingDate,
            conflicts: conflictCheck.rows
          });
        }
      }

      const ruleEval = evaluateRules({
        rules: ruleRows,
        booking: {
          date: bookingDate,
          start_time,
          end_time,
          user_id,
        },
        resources: resourceRows,
        roles,
      });
      lastRuleEval = ruleEval;

      if (ruleEval.hardViolations.length > 0) {
        await client.query("ROLLBACK");
        return res.status(422).json({
          error: "Rule violations",
          date: bookingDate,
          violations: ruleEval.hardViolations,
          alerts: ruleEval.alerts,
        });
      }

      /* 3. Create booking */
      const bookingResult = await client.query(
        `
        INSERT INTO bookings (user_id, date, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
        [user_id, bookingDate, start_time, end_time]
      );

      const booking = bookingResult.rows[0];

      /* 4. Insert into booking_resources */
      for (let r of resources) {
        await client.query(
          `
          INSERT INTO booking_resources (booking_id, resource_id, role)
          VALUES ($1, $2, $3)
        `,
          [booking.id, r, roles?.[r] || null]
        );
      }

      createdBookings.push(booking);
    }

    await client.query("COMMIT");

    res.json({
      message: "Booking created",
      bookings: createdBookings,
      count: createdBookings.length,
      rule_summary: {
        score: lastRuleEval?.score ?? null,
        soft_matches: lastRuleEval?.softMatches || [],
        alerts: lastRuleEval?.alerts || [],
      },
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking error:", err);
    res.status(500).json({ error: "Booking failed" });
  } finally {
    client.release();
  }
});

// UPDATE booking
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { resources, roles, date, start_time, end_time, user_id } = req.body;
  const orgId = getOrgId(req);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });
  if (!resources || resources.length === 0) {
    return res.status(400).json({ error: "No resources provided" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roleMap = roles && typeof roles === "object" ? roles : {};
    const responsibleResources = resources.filter((rid) => {
      const roleValue = String(roleMap?.[rid] || "").toLowerCase();
      return roleValue === "responsible";
    });
    if (responsibleResources.length > 0) {
      const conflictParams = [responsibleResources, date, start_time, end_time, id];
      let conflictOrg = "";
      if (orgId) {
        conflictParams.push(orgId);
        conflictOrg = `AND r.organization_id = $${conflictParams.length}`;
      }
      const conflictCheck = await client.query(
        `
        SELECT br.resource_id, br.role, b.*
        FROM booking_resources br
        JOIN bookings b ON b.id = br.booking_id
        JOIN resources r ON r.id = br.resource_id
        LEFT JOIN booking_cancellations bc ON bc.booking_id = b.id
        WHERE br.resource_id = ANY($1)
        AND LOWER(COALESCE(br.role, '')) = 'responsible'
        AND b.date = $2
        AND b.id <> $5
        AND bc.booking_id IS NULL
        ${conflictOrg}
        AND (
          ($3 >= b.start_time AND $3 < b.end_time) OR
          ($4 > b.start_time AND $4 <= b.end_time) OR
          ($3 <= b.start_time AND $4 >= b.end_time)
        )
      `,
        conflictParams
      );

      if (conflictCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Resources conflict",
          conflicts: conflictCheck.rows
        });
      }
    }

    const resourceParams = [resources];
    let resourceWhere = "WHERE r.id = ANY($1)";
    if (orgId) {
      resourceParams.push(orgId);
      resourceWhere = "WHERE r.id = ANY($1) AND r.organization_id = $2";
    }
    const { rows: resourceRows } = await client.query(
      `
      SELECT r.*, rt.name AS type_name, rt.roles AS type_roles, rt.fields AS type_fields
      FROM resources r
      JOIN resource_types rt ON rt.id = r.type_id
      ${resourceWhere}
      `,
      resourceParams
    );

    if (resourceRows.length !== resources.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "One or more resources not found" });
    }

    const ruleParams = [];
    let ruleWhere = "WHERE is_active = true";
    if (orgId) {
      ruleParams.push(orgId);
      ruleWhere += ` AND organization_id = $${ruleParams.length}`;
    }
    const { rows: ruleRows } = await client.query(
      `SELECT * FROM rules ${ruleWhere} ORDER BY sort_order ASC, id ASC`,
      ruleParams
    );

    const ruleEval = evaluateRules({
      rules: ruleRows,
      booking: {
        date,
        start_time,
        end_time,
        user_id,
      },
      resources: resourceRows,
      roles,
    });

    if (ruleEval.hardViolations.length > 0) {
      await client.query("ROLLBACK");
      return res.status(422).json({
        error: "Rule violations",
        violations: ruleEval.hardViolations,
        alerts: ruleEval.alerts,
      });
    }

    const bookingResult = await client.query(
      `
      UPDATE bookings
      SET user_id = $1, date = $2, start_time = $3, end_time = $4
      WHERE id = $5
      RETURNING *
      `,
      [user_id, date, start_time, end_time, id]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found" });
    }

    await client.query(`DELETE FROM booking_resources WHERE booking_id = $1`, [id]);

    for (const r of resources) {
      await client.query(
        `
        INSERT INTO booking_resources (booking_id, resource_id, role)
        VALUES ($1, $2, $3)
      `,
        [id, r, roles?.[r] || null]
      );
    }

    await client.query("COMMIT");

    res.json({
      message: "Booking updated",
      booking: bookingResult.rows[0],
      rule_summary: {
        score: ruleEval.score,
        soft_matches: ruleEval.softMatches,
        alerts: ruleEval.alerts,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Booking update error:", err);
    res.status(500).json({ error: "Booking update failed" });
  } finally {
    client.release();
  }
});

// DELETE booking
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid booking id" });

  try {
    const { rowCount } = await pool.query(`DELETE FROM bookings WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: "Booking not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Booking delete error:", err);
    res.status(500).json({ error: "Booking delete failed" });
  }
});

export default router;
