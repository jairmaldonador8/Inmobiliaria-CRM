-- 0019: nuevo valor 'venta' en tipo_interes.
--
-- Los leads del sitio oficial que llegan queriendo VENDER una propiedad son
-- posibles captaciones, no compradores. El sitio los manda con interes=venta
-- via POST /api/leads/captura para poder distinguirlos desde hoy; el modulo
-- de captaciones (pipeline propio) queda como feature futura y se montara
-- sobre este mismo valor.

alter type tipo_interes add value if not exists 'venta';
