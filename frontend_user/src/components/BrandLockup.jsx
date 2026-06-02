const BRAND_LOGO_SRC = "/brand-logo.png";

export default function BrandLockup({
  eyebrow,
  title = "SmartAllocate",
  subtitle,
  className = "",
  compact = false,
  titleAs: TitleTag = "div",
}) {
  const classes = ["brand-lockup", compact ? "brand-lockup--compact" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <img className="brand-lockup__logo" src={BRAND_LOGO_SRC} alt="" aria-hidden="true" />
      <div className="brand-lockup__copy">
        {eyebrow ? <p className="brand-lockup__eyebrow">{eyebrow}</p> : null}
        <TitleTag className="brand-lockup__title">{title}</TitleTag>
        {subtitle ? <p className="brand-lockup__subtitle">{subtitle}</p> : null}
      </div>
    </div>
  );
}
