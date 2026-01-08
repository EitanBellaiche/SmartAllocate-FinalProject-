 id |        name        | target_type | is_hard | is_active | sort_order | weight |                                                        condition                                                         |              action              
----+--------------------+-------------+---------+-----------+------------+--------+--------------------------------------------------------------------------------------------------------------------------+----------------------------------
  3 | try                | pair        | f       | t         |          0 |     10 | {"all": [{"op": "==", "field": "resource.type_id", "value": 1}]}                                                         | {"delta": 30, "effect": "score"}
  1 | Projector required | resource    | t       | t         |          1 |      1 | {"and": [{"eq": [{"var": "booking.requiresProjector"}, true]}, {"neq": [{"var": "resource.metadata.projector"}, true]}]} | {"reject": "ProjectorMissing"}
(2 rows)

