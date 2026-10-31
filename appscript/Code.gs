/**
 * DON PIEROS PIZZA - Inventario e ingresos historicos
 *
 * Todo se almacena en un unico archivo de Google Sheets.
 * No requiere archivos HTML, puentes, libros auxiliares ni libros anuales.
 * Publique este Code.gs como aplicacion web: ejecutar como usted y acceso para cualquiera.
 */

var APP = {
  version: "3.6.1-donpieros",
  spreadsheetId: "1uzIMd_xhCsICQgdlYcZuEgOfq07XUt9iFCume64LT2E",
  properties: {
    schemaVersion: "DP_SCHEMA_VERSION",
    supabaseUrl: "DP_SUPABASE_URL",
    supabaseAnonKey: "DP_SUPABASE_ANON_KEY",
    allowedOrigins: "DP_ALLOWED_ORIGINS",
    timezone: "DP_TIMEZONE"
  },
  sheets: {
    config: "Configuracion",
    shifts: "Turnos_Caja",
    inventory: "Inventario",
    audit: "Auditoria",
    sales: "Ventas",
    details: "Detalle_Ventas",
    payments: "Pagos",
    movements: "Movimientos_Inventario",
    daily: "Ingresos_Diarios"
  }
};

var HEADERS = {
  shifts: ["operation_id", "shift_id", "fecha_turno", "inicio_minutos", "cierre_minutos", "base_inicial", "base_actual", "version", "creado_en", "actualizado_en", "usuario", "operacion", "importe"],
  inventory: [
    "product_id", "siglas", "producto", "categoria", "unidad", "costo_unitario",
    "precio_venta", "existencia", "stock_minimo", "disponible", "actualizado_en",
    "ultimo_movimiento", "version", "notas"
  ],
  audit: ["fecha", "evento", "referencia", "usuario", "estado", "detalle"],
  sales: [
    "sale_id", "factura", "session_id", "table_id", "mesa", "fecha", "responsable",
    "mesero", "subtotal", "descuento", "impuestos", "servicio", "total",
    "forma_pago", "referencia_pago", "origen", "sincronizado_en", "cobrado_por", "cobrado_usuario_id", "pedido_web_id", "cobro_id", "entrega", "cobrado_rol"
  ],
  details: [
    "sale_id", "factura", "line_id", "menu_item_id", "producto", "cantidad",
    "precio_unitario", "total_linea", "costo_unitario", "costo_total", "utilidad_bruta", "notas"
  ],
  payments: ["sale_id", "factura", "medio", "valor", "referencia", "fecha"],
  movements: [
    "movement_id", "product_id", "siglas", "producto", "tipo", "cantidad_cambio",
    "existencia_antes", "existencia_despues", "costo_unitario", "factura",
    "session_id", "fecha", "usuario"
  ],
  daily: [
    "fecha", "numero_ventas", "ingreso_bruto", "efectivo", "transferencia", "bre_b",
    "descuentos", "impuestos", "servicio", "costo_mercancia", "utilidad_bruta", "actualizado_en",
    "ventas_procesadas", "tarjeta"
  ]
};

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("Don Pieros Pizza")
      .addItem("Configurar sistema", "CONFIGURAR_SISTEMA")
      .addItem("Guardar configuracion", "GUARDAR_CONFIGURACION")
      .addToUi();
  } catch (error) {
    // Un proyecto independiente no tiene interfaz de hoja hasta crear el maestro.
  }
}

function CONFIGURAR_SISTEMA() {
  var spreadsheet = getSpreadsheet_();
  spreadsheet.setSpreadsheetTimeZone("America/Bogota");
  ensureAllSheets_(spreadsheet);
  seedConfiguration_(spreadsheet);
  dpSeedProperties_();
  PropertiesService.getScriptProperties().setProperty(APP.properties.schemaVersion, APP.version);
  appendAudit_("SETUP", spreadsheet.getId(), "Sistema", "OK", "Sistema inicializado en el archivo unico.");
  var result = {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheets: Object.keys(APP.sheets).map(function (key) { return APP.sheets[key]; }),
    message: "Todas las pestañas fueron creadas en el archivo configurado."
  };
  console.log("Archivo configurado: " + result.spreadsheetUrl);
  return result;
}

function GUARDAR_CONFIGURACION() {
  var spreadsheet = getSpreadsheet_();
  ensureAllSheets_(spreadsheet);
  var sheet = spreadsheet.getSheetByName(APP.sheets.config);
  var values = sheet.getDataRange().getDisplayValues();
  var config = {};
  for (var row = 1; row < values.length; row += 1) {
    var key = String(values[row][0] || "").trim();
    if (key) config[key] = String(values[row][1] || "").trim();
  }
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty(APP.properties.supabaseUrl, config.SUPABASE_URL || "");
  properties.setProperty(APP.properties.supabaseAnonKey, config.SUPABASE_ANON_KEY || "");
  properties.setProperty(APP.properties.allowedOrigins, config.ORIGENES_PERMITIDOS || "");
  properties.setProperty(APP.properties.timezone, config.ZONA_HORARIA || "America/Bogota");
  CacheService.getScriptCache().remove("dp_config");
  appendAudit_("CONFIG", "Configuracion", "Sistema", "OK", "Configuracion guardada.");
  return { ok: true, message: "Configuracion guardada." };
}

function doGet() {
  try {
    ensureSystemReady_();
    return jsonOutput_({
      ok: true,
      service: "DON PIEROS PIZZA",
      version: APP.version,
      configured: isConfigured_(),
      capabilities: { onlineOrders: true, webCheckout:true,orderDeletion: true, fastOrderReception: true, catalog: true, queue: true, receipts: false, liveLocation: false },
      spreadsheetId: APP.spreadsheetId
    });
  } catch (error) {
    return jsonOutput_({ ok: false, service: "DON PIEROS PIZZA", version: APP.version, error: String(error.message || error) });
  }
}

function doPost(e) {
  var body = e && e.postData ? e.postData.contents : "{}";
  return jsonOutput_(apiRequest(body));
}

function apiRequest(payloadText) {
  var request = {};
  try {
    request = JSON.parse(String(payloadText || "{}"));
    ensureSystemReady_();
    if (/^dp_/.test(request.action || "") || request.action === "createOrder") return dpDispatch_(request);
    if (request.action === "bootstrap") {
      return bootstrapConnection_(request.payload || {}, request.origin, request.authToken);
    }
    validateOrigin_(request.origin);
    if (request.action === "status") {
      var revisionProperties = PropertiesService.getScriptProperties();
      return {
        ok: true,
        version: APP.version,
        configured: isConfigured_(),
        historyRevision: revisionProperties.getProperty("DP_HISTORY_REVISION") || "",
        movementRevision: revisionProperties.getProperty("DP_MOVEMENT_REVISION") || ""
      };
    }
    var user = validateSupabaseUser_(request.authToken);
    var payload = request.payload || {};
    var result;
    if (request.action === "sync_sales_batch") return syncSalesBatch_(payload.operations, user, request.authToken);
    if (request.action === "get_inventory") result = getInventory_();
    else if (request.action === "get_inventory_movements") {
      requireSection_(user, "movements");
      result = getInventoryMovements_(payload.limit, payload.cursor, payload.revision);
    }
    else if (request.action === "get_sales_shift") {
      requireSection_(user, "income");
      result = getSalesShift_();
    }
    else if (request.action === "save_sales_shift") {
      requireSection_(user, "income");
      result = saveSalesShift_(payload, user);
    }
    else if (request.action === "get_income_report") {
      requireSection_(user, "income");
      result = getIncomeReport_(payload.filters || {});
    }
    else if (request.action === "record_sale" || request.action === "checkout_web_order") {
      requireManager_(user);
      if(request.action==='checkout_web_order'&&!(payload.invoice&&payload.invoice.webOrderId))throw new Error('Pedido web inválido.');
      result = recordSale_(payload.invoice, user, request.authToken);
    }
    else if (request.action === "edit_sale") {
      requireBoss_(user);
      result = editSale_(payload.invoice, user, request.operationId);
    }
    else if (request.action === "delete_sale") {
      requireBoss_(user);
      result = deleteSale_(payload.saleId, user, request.operationId);
    }
    else if (request.action === "adjust_inventory") {
      requireSection_(user, "inventory");
      result = adjustInventory_(payload.adjustment, user);
    }
    else if (request.action === "update_inventory_movement_cost") {
      requireSection_(user, "inventory");
      result = updateInventoryMovementCost_(payload.movementId, payload.unitCost, user);
    }
    else if (request.action === "set_inventory_stock") {
      requireSection_(user, "inventory");
      result = setInventoryStock_(payload, user);
    }
    else if (request.action === "delete_inventory") {
      requireBoss_(user);
      result = deleteInventory_(payload.productId, user);
    }
    else if (request.action === "clear_inventory") {
      requireBoss_(user);
      result = clearInventory_(user, request.authToken);
    }
    else if (request.action === "clear_inventory_movements") {
      requireBoss_(user);
      result = clearInventoryMovements_(user);
    }
    else if (request.action === "clear_income") {
      requireBoss_(user);
      result = clearIncome_(user);
    }
    else if (request.action === "upsert_inventory") {
      requireSection_(user, "inventory");
      result = upsertInventory_(payload.item, user);
    } else if (request.action === "sync_inventory") {
      requireSection_(user, "inventory");
      result = syncInventory_(payload.items || [], user);
    } else {
      throw new Error("Accion no permitida: " + request.action);
    }
    if (result && result.ok === false) return result;
    if (["record_sale", "edit_sale", "delete_sale", "clear_income"].indexOf(request.action) >= 0
        && !result.duplicate && result.deleted !== false) {
      PropertiesService.getScriptProperties().setProperty("DP_HISTORY_REVISION", String(new Date().getTime()) + "-" + Math.random());
    }
    if (["upsert_inventory", "sync_inventory", "adjust_inventory", "set_inventory_stock", "delete_inventory", "clear_inventory", "update_inventory_movement_cost", "record_sale", "edit_sale", "delete_sale", "clear_inventory_movements"].indexOf(request.action) >= 0
        && !result.duplicate && result.deleted !== false) {
      PropertiesService.getScriptProperties().setProperty("DP_MOVEMENT_REVISION", String(new Date().getTime()) + "-" + Math.random());
    }
    if (["upsert_inventory", "sync_inventory", "adjust_inventory", "set_inventory_stock", "delete_inventory", "clear_inventory", "record_sale", "edit_sale", "delete_sale"].indexOf(request.action) >= 0) {
      PropertiesService.getScriptProperties().setProperty("DP_INVENTORY_INITIALIZED", "1");
    }
    result.ok = true;
    return result;
  } catch (error) {
    try {
      appendAudit_("API_ERROR", request.action || "unknown", "Sistema", "ERROR", String(error.message || error));
    } catch (auditError) {
      // La respuesta original tiene prioridad.
    }
    return { ok: false, retryable: error.retryable !== false, alreadyPaid:!!error.alreadyPaid,code: error.code || "", error: String(error.message || error) };
  }
}


function syncSalesBatch_(operations, user, authToken) {
  requireManager_(user);
  if (!Array.isArray(operations) || !operations.length || operations.length > 20) throw new Error("Lote de ventas inválido.");
  operations.forEach(function (op) {
    if (!op || !/^[a-zA-Z0-9:_-]{1,180}$/.test(String(op.operationId || ""))
      || ["record_sale", "edit_sale", "delete_sale"].indexOf(op.action) < 0) throw new Error("Operación de lote inválida.");
    if (op.action !== "record_sale") requireBoss_(user);
  });
  return withScriptLock_(function () {
    var spreadsheet = getSpreadsheet_(), sheet = spreadsheet.getSheetByName("Operaciones_Sync");
    if (!sheet) { sheet = spreadsheet.insertSheet("Operaciones_Sync"); appendRows_(sheet, [["operation_id", "firma", "resultado", "fecha"]]); }
    var receipts = readSheetRows_(sheet, 4), saved = {}, results = [], started = Date.now();
    receipts.forEach(function (row) { saved[String(row[0])] = row; });
    for (var index = 0; index < operations.length; index++) {
      if (index && Date.now() - started > 18000) break;
      var op = operations[index], payload = op.payload || {};
      var signaturePayload = JSON.parse(JSON.stringify(payload));
      if (signaturePayload.invoice) { delete signaturePayload.invoice.checkoutAccepted; delete signaturePayload.invoice.googlePending; }
      var signature = hash_(JSON.stringify([user.id, op.action, signaturePayload]));
      var result;
      if (saved[op.operationId]) {
        if (String(saved[op.operationId][1]) !== signature) {
          results.push({ operationId: op.operationId, result: { ok: false, retryable: false, conflict: true, error: "La operación ya existe con otro contenido." } });
          break;
        }
        result = JSON.parse(saved[op.operationId][2]);
      } else {
        try {
          if (op.action === "record_sale") result = recordSale_(payload.invoice, user, authToken);
          else if (op.action === "edit_sale") result = editSale_(payload.invoice, user, op.operationId);
          else result = deleteSale_(payload.saleId, user, op.operationId);
          if (result.ok !== false) {
            result.ok = true;
            // Invalidate before the receipt: a crash must never leave an
            // acknowledged mutation hidden behind an unchanged report revision.
            var revision = String(Date.now()) + "-" + Math.random();
            PropertiesService.getScriptProperties().setProperty("DP_HISTORY_REVISION", revision);
            PropertiesService.getScriptProperties().setProperty("DP_MOVEMENT_REVISION", revision);
            var compact = Object.assign({}, result); delete compact.items;
            appendRows_(sheet, [[op.operationId, signature, JSON.stringify(compact), new Date().toISOString()]]);
            SpreadsheetApp.flush();
            saved[op.operationId] = [op.operationId, signature, JSON.stringify(compact)];
          }
        } catch (error) {
          result = { ok: false, retryable: error.retryable !== false, error: String(error.message || error) };
        }
      }
      results.push({ operationId: op.operationId, result: Object.assign({}, result, { batchReceipt: true }) });
      if (result.ok === false) break;
    }
    // One inventory snapshot for the whole envelope, not one per receipt.
    var items = getInventory_().items;
    if (results.length) results[results.length - 1].result.items = items;
    return { ok: true, results: results };
  });
}

function salesMutationResult_(operationId) {
  if (!operationId) return null;
  var sheet = saleJournalSheet_(getSpreadsheet_());
  var row = findSaleJournalRow_(sheet, "mutation:" + operationId);
  if (!row) return null;
  var metadata = sheet.getRange(row, 1, 1, 5).getValues()[0];
  if (String(metadata[2]) !== "committed") throw new Error("Cambio pendiente de recuperación.");
  var plan = JSON.parse(sheet.getRange(row, 6, 1, Number(metadata[3])).getValues()[0].join(""));
  return Object.assign({}, plan.result, { duplicate: true, items: getInventory_().items });
}

function commitSalesMutation_(spreadsheet, operationId, tables, result) {
  // Journal only this sale and its affected products, never a copy of the
  // complete sales history for every click.
  var productIds = {};
  readSheetRows_(spreadsheet.getSheetByName(APP.sheets.details), HEADERS.details.length).forEach(function (row) {
    if (String(row[0]) === String(result.saleId) && row[3]) productIds[String(row[3])] = true;
  });
  tables.forEach(function (table) {
    if (table.key === "details") table.rows.forEach(function (row) {
      if (String(row[0]) === String(result.saleId) && row[3]) productIds[String(row[3])] = true;
    });
  });
  tables = tables.map(function (table) {
    return { key: table.key, width: table.width, rows: table.rows.filter(function (row) {
      return table.key === "inventory" ? productIds[String(row[0])]
        : table.key === "movements" || String(row[0]) === String(result.saleId);
    }) };
  });
  var plan = { kind: "mutation", saleId: "mutation:" + (operationId || Utilities.getUuid()),
    targetSaleId: result.saleId, sessionId: "", tables: tables, result: result };
  var pending = prepareSaleJournal_(spreadsheet, plan);
  applySaleJournal_(spreadsheet, pending.row, plan);
}

function ensureSystemReady_() {
  var spreadsheet = getSpreadsheet_();
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(APP.properties.schemaVersion) !== APP.version) {
    dpWithLock_(function(){
      if(properties.getProperty(APP.properties.schemaVersion)===APP.version)return;
      spreadsheet.setSpreadsheetTimeZone(getTimezone_());
      ensureAllSheets_(spreadsheet);
      seedConfiguration_(spreadsheet);
      dpSeedProperties_();
      properties.setProperty(APP.properties.schemaVersion, APP.version);
    });
  }
  return spreadsheet;
}

function bootstrapConnection_(payload, origin, authToken) {
  var candidate = {
    supabaseUrl: String(payload.supabaseUrl || "").trim().replace(/\/$/, ""),
    supabaseAnonKey: String(payload.supabaseAnonKey || "").trim()
  };
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(candidate.supabaseUrl) || !candidate.supabaseAnonKey) {
    throw new Error("La conexion operativa enviada por el panel esta incompleta.");
  }
  var user = validateSupabaseUserWithConfig_(authToken, candidate);
  requireBoss_(user);
  var properties = PropertiesService.getScriptProperties();
  var existingOrigins = String(properties.getProperty(APP.properties.allowedOrigins) || "")
    .split(",").map(function (value) { return value.trim(); }).filter(Boolean);
  var cleanOrigin = String(origin || "").trim();
  if (cleanOrigin && existingOrigins.indexOf(cleanOrigin) < 0) existingOrigins.push(cleanOrigin);
  properties.setProperty(APP.properties.supabaseUrl, candidate.supabaseUrl);
  properties.setProperty(APP.properties.supabaseAnonKey, candidate.supabaseAnonKey);
  properties.setProperty(APP.properties.allowedOrigins, existingOrigins.join(","));
  if (!properties.getProperty(APP.properties.timezone)) properties.setProperty(APP.properties.timezone, "America/Bogota");
  updateConfigurationSheet_(candidate, existingOrigins);
  CacheService.getScriptCache().remove("dp_config");
  CacheService.getScriptCache().put("user_" + hash_(String(authToken || "")), JSON.stringify(user), 120);
  appendAudit_("REMOTE_BOOTSTRAP", cleanOrigin, user.full_name || user.username, "OK", "Conexion inicializada desde el panel.");
  return { ok: true, configured: true, version: APP.version, timezone: getTimezone_(), user: { id: user.id, role: user.role } };
}

function updateConfigurationSheet_(candidate, origins) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(APP.sheets.config);
  var values = sheet.getDataRange().getValues();
  var updates = {
    SUPABASE_URL: candidate.supabaseUrl,
    SUPABASE_ANON_KEY: candidate.supabaseAnonKey,
    ORIGENES_PERMITIDOS: origins.join(",")
  };
  for (var row = 1; row < values.length; row += 1) {
    var key = String(values[row][0] || "").trim();
    if (Object.prototype.hasOwnProperty.call(updates, key)) sheet.getRange(row + 1, 2).setValue(updates[key]);
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(APP.spreadsheetId);
}

function ensureAllSheets_(spreadsheet) {
  dpEnsureSheets_(spreadsheet);
  ensureSheet_(spreadsheet,'Operaciones_Sync',['operation_id','firma','resultado','fecha']);
  saleJournalSheet_(spreadsheet);
  ensureSheet_(spreadsheet, APP.sheets.config, ["Clave", "Valor", "Descripcion"]);
  ensureSheet_(spreadsheet, APP.sheets.inventory, HEADERS.inventory);
  ensureSheet_(spreadsheet, APP.sheets.audit, HEADERS.audit);
  ensureSheet_(spreadsheet, APP.sheets.shifts, HEADERS.shifts);
  ensureSheet_(spreadsheet, APP.sheets.sales, HEADERS.sales);
  spreadsheet.getSheetByName(APP.sheets.sales).getRange(1,18,1,HEADERS.sales.length-17).setValues([HEADERS.sales.slice(17)]);
  ensureSheet_(spreadsheet, APP.sheets.details, HEADERS.details);
  spreadsheet.getSheetByName(APP.sheets.details).getRange(1,HEADERS.details.length).setValue('notas');
  ensureSheet_(spreadsheet, APP.sheets.payments, HEADERS.payments);
  ensureSheet_(spreadsheet, APP.sheets.movements, HEADERS.movements);
  ensureSheet_(spreadsheet, APP.sheets.daily, HEADERS.daily);
}

function seedConfiguration_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(APP.sheets.config);
  if (sheet.getLastRow() > 1) return;
  var rows = [
    ["NEGOCIO", "DON PIEROS PIZZA", "Nombre del negocio"],
    ["SUPABASE_URL", "https://bxyvxbutjlvoconfsjub.supabase.co", "URL del proyecto Supabase"],
    ["SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4eXZ4YnV0amx2b2NvbmZzanViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDcwNDUsImV4cCI6MjEwMzA4MzA0NX0.-7NfjICnFLbUI952-Vpw8vlNo70-p7J9yB8Inqh_7b8", "Clave anon valida; se usa solo en Apps Script"],
    ["ORIGENES_PERMITIDOS", "null,http://localhost:5500", "Dominios separados por coma; agregue el dominio real"],
    ["ZONA_HORARIA", "America/Bogota", "Zona horaria del negocio"]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  sheet.autoResizeColumns(1, 3);
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (typeof sheet.getMaxColumns === 'function' && sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0 || String(sheet.getRange(1, 1).getValue()) !== headers[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#17191f")
    .setFontColor("#ffffff");
  return sheet;
}

function getInventory_() {
  var table = readInventoryTable_();
  var items = [];
  for (var index = 0; index < table.rows.length; index += 1) {
    var row = table.rows[index];
    if (!row[0]) continue;
    items.push(inventoryRowToObject_(row));
  }
  var properties = PropertiesService.getScriptProperties();
  if (items.length && properties.getProperty("DP_INVENTORY_INITIALIZED") !== "1") properties.setProperty("DP_INVENTORY_INITIALIZED", "1");
  return { items: items, everInitialized: properties.getProperty("DP_INVENTORY_INITIALIZED") === "1", syncedAt: new Date().toISOString() };
}

function getInventoryMovements_(requestedLimit, requestedCursor, requestedRevision) {
  var sheet = getSpreadsheet_().getSheetByName(APP.sheets.movements);
  var revision = PropertiesService.getScriptProperties().getProperty("DP_MOVEMENT_REVISION") || "";
  if (requestedCursor && String(requestedRevision || "") !== revision) return { stale: true, movements: [] };
  var limit = Math.min(800, Math.max(1, asNumber_(requestedLimit) || 800));
  var lastRow = sheet.getLastRow();
  var cursor = requestedCursor ? Math.min(lastRow, Math.floor(asNumber_(requestedCursor))) : lastRow;
  if (!isFinite(cursor) || cursor < 2) cursor = 1;
  var firstRow = Math.max(2, cursor - limit + 1);
  var rows = cursor >= 2 ? sheet.getRange(firstRow, 1, cursor - firstRow + 1, HEADERS.movements.length).getValues() : [];
  return {
    movements: rows.reverse().map(function (row) {
      return {
        movementId: String(row[0] || ""),
        productId: String(row[1] || ""),
        code: String(row[2] || ""),
        product: String(row[3] || "Producto"),
        type: String(row[4] || "MOVIMIENTO"),
        delta: asNumber_(row[5]),
        before: asNumber_(row[6]),
        after: asNumber_(row[7]),
        unitCost: asNumber_(row[8]),
        reference: String(row[9] || row[10] || ""),
        sessionId: String(row[10] || ""),
        date: row[11] instanceof Date ? row[11].toISOString() : String(row[11] || ""),
        user: String(row[12] || "Sistema")
      };
    }),
    nextCursor: firstRow > 2 ? firstRow - 1 : null,
    hasMore: firstRow > 2,
    revision: revision
  };
}

function updateInventoryMovementCost_(movementId, unitCost, user) {
  var id = String(movementId || "").trim();
  var cost = asNumber_(unitCost);
  if (!id || !isFinite(cost) || cost < 0) return { ok: false, retryable: false, error: "Costo de compra inválido." };
  return withScriptLock_(function () {
    var sheet = getSpreadsheet_().getSheetByName(APP.sheets.movements);
    var rows = readSheetRows_(sheet, HEADERS.movements.length);
    var rowIndex = -1;
    for (var index = 0; index < rows.length; index += 1) {
      if (String(rows[index][0] || "") === id) {
        rowIndex = index;
        break;
      }
    }
    if (rowIndex < 0) return { ok: false, retryable: false, error: "La compra ya no existe en el historial." };
    var row = rows[rowIndex];
    var type = String(row[4] || "").trim().toUpperCase();
    if (asNumber_(row[5]) <= 0 || (type !== "NUEVO_PRODUCTO" && type.indexOf("ENTRADA") !== 0)) {
      return { ok: false, retryable: false, error: "Solo se puede cambiar el costo de una compra." };
    }
    sheet.getRange(rowIndex + 2, 9).setValue(cost);
    appendAudit_("PURCHASE_COST_UPDATE", id, user.full_name || user.username, "OK", "Costo unitario " + cost);
    return { movementId: id, unitCost: cost };
  });
}

function salesShiftFromRow_(row) {
  if (!row || !row[1]) return null;
  return { id: String(row[1]), date: row[2] instanceof Date ? Utilities.formatDate(row[2], "America/Bogota", "yyyy-MM-dd") : String(row[2]),
    startMinutes: Number(row[3]), endMinutes: Number(row[4]), initialBase: Number(row[5]), base: Number(row[6]), version: Number(row[7]),
    createdAt: row[8] instanceof Date ? row[8].toISOString() : String(row[8]), updatedAt: row[9] instanceof Date ? row[9].toISOString() : String(row[9]), updatedBy: String(row[10]) };
}

function getSalesShift_() {
  var sheet = getSpreadsheet_().getSheetByName(APP.sheets.shifts);
  var rows = sheet && sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.shifts.length).getValues() : [];
  var shifts = [], indexes = {};
  rows.forEach(function (row) {
    var shift = salesShiftFromRow_(row);
    if (!shift) return;
    if (indexes[shift.id] === undefined) { indexes[shift.id] = shifts.length; shifts.push(shift); }
    else shifts[indexes[shift.id]] = shift;
  });
  return { shift: shifts.length ? shifts[shifts.length - 1] : null, shifts: shifts };
}

function saveSalesShift_(payload, user) {
  return withScriptLock_(function () {
    var sheet = ensureSheet_(getSpreadsheet_(), APP.sheets.shifts, HEADERS.shifts);
    var history = getSalesShift_(), current = history.shift;
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(payload.id || ""))) throw new Error("Identificador de operación inválido.");
    // Cada operación se registra una sola vez, incluso si se perdió la respuesta o se reenvía desde Offline.
    if (sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(payload.id).matchEntireCell(true).findNext()) {
      return { shift: current, shifts: history.shifts, duplicate: true };
    }
    var conflict = function (message) { return { ok: false, retryable: false, shift: current, shifts: history.shifts, error: message }; };
    var action = String(payload.action || ""), target = action === "edit"
      ? history.shifts.filter(function (shift) { return shift.id === String(payload.expectedId || ""); })[0] : current;
    if (String(payload.expectedId || "") !== String(target && target.id || "") || Number(payload.expectedVersion || 0) !== Number(target && target.version || 0)) {
      return conflict("Otro equipo actualizó el turno o su base. Revisa el saldo actual y vuelve a guardar.");
    }
    var amount = Number(payload.amount), now = new Date().toISOString();
    if (["new", "replace", "add", "edit"].indexOf(action) < 0 || (action !== "edit" && (!Number.isSafeInteger(amount) || amount < 0 || amount > 999999999999 || (action === "add" && amount === 0)))) {
      return conflict("Escribe un valor válido en pesos colombianos.");
    }
    var saved;
    if (action === "new" || action === "edit") {
      var date = String(payload.date || ""), start = Number(payload.startMinutes), end = Number(payload.endMinutes);
      var midnight = Date.parse(date + "T00:00:00-05:00");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(midnight) || Utilities.formatDate(new Date(midnight), "America/Bogota", "yyyy-MM-dd") !== date
        || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0 || start >= 1440 || end >= 1440 || start === end) {
        return conflict("La fecha y las horas del turno no son válidas.");
      }
      var startAt = midnight + start * 60000;
      var endAt = midnight + end * 60000 + (end < start ? 86400000 : 0);
      var overlaps = history.shifts.some(function (other) {
        if (action === "edit" && other.id === target.id) return false;
        var otherMidnight = Date.parse(other.date + "T00:00:00-05:00");
        var otherStart = otherMidnight + other.startMinutes * 60000;
        var otherEnd = otherMidnight + other.endMinutes * 60000 + (other.endMinutes < other.startMinutes ? 86400000 : 0);
        return startAt < otherEnd && endAt > otherStart;
      });
      if (overlaps) return conflict("El horario se cruza con otro turno registrado.");
      if (action === "new" && current) {
        var previousEnd = Date.parse(current.date + "T00:00:00-05:00") + current.endMinutes * 60000 + (current.endMinutes < current.startMinutes ? 86400000 : 0);
        if (Date.now() < previousEnd || startAt < previousEnd) return conflict("El nuevo turno no puede solaparse con el turno anterior.");
      }
      saved = action === "new"
        ? { id: payload.id, date: date, startMinutes: start, endMinutes: end, base: amount, initialBase: amount, version: 1, createdAt: now, updatedAt: now }
        : Object.assign({}, target, { date: date, startMinutes: start, endMinutes: end, version: target.version + 1, updatedAt: now });
    } else {
      if (!current) return conflict("Primero registra un turno.");
      saved = Object.assign({}, current, { base: action === "add" ? current.base + amount : amount, version: current.version + 1, updatedAt: now });
      if (!Number.isSafeInteger(saved.base) || saved.base > 999999999999) return conflict("El saldo base supera el valor permitido.");
    }
    saved.updatedBy = String(user.full_name || user.username || "Equipo");
    sheet.appendRow([payload.id, saved.id, saved.date, saved.startMinutes, saved.endMinutes, saved.initialBase, saved.base, saved.version,
      saved.createdAt, saved.updatedAt, saved.updatedBy, action, amount]);
    SpreadsheetApp.flush();
    return getSalesShift_();
  });
}

function getIncomeReport_(filters) {
  var spreadsheet = getSpreadsheet_();
  var timezone = getTimezone_();
  var pageRows = Array.isArray(filters.pageRows) ? filters.pageRows.slice(0, 300) : null;
  var revision = PropertiesService.getScriptProperties().getProperty("DP_HISTORY_REVISION") || "";
  if (pageRows && String(filters.revision || "") !== revision) return { stale: true, records: [] };
  var today = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd");
  var dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.dateFrom || "")) ? String(filters.dateFrom) : today;
  var dateTo = /^\d{4}-\d{2}-\d{2}$/.test(String(filters.dateTo || "")) ? String(filters.dateTo) : today;
  if (dateFrom > dateTo) {
    var swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }
  var intervalStart = filters.startAt ? Date.parse(filters.startAt) : null;
  var intervalEnd = filters.endAt ? Date.parse(filters.endAt) : null;
  if ((filters.startAt || filters.endAt) && (!isFinite(intervalStart) || !isFinite(intervalEnd) || intervalStart === null || intervalEnd === null || intervalStart >= intervalEnd)) throw new Error("Horario de ventas inválido.");
  var methodFilter = String(filters.paymentMethod || "all").toLowerCase();
  var query = normalizeSearch_(filters.query || "");
  var salesSheet = spreadsheet.getSheetByName(APP.sheets.sales);
  var salesRows = pageRows ? [] : readSheetRows_(salesSheet, HEADERS.sales.length);
  if (pageRows) {
    var validRows = pageRows.map(function (entry) { return Math.floor(asNumber_(entry.row)); })
      .filter(function (row) { return row >= 2 && row <= salesSheet.getLastRow(); }).sort(function (a, b) { return a - b; });
    for (var position = 0; position < validRows.length;) {
      var end = position + 1;
      while (end < validRows.length && validRows[end] - validRows[end - 1] <= 20 && validRows[end] - validRows[position] < 600) end += 1;
      var block = salesSheet.getRange(validRows[position], 1, validRows[end - 1] - validRows[position] + 1, HEADERS.sales.length).getValues();
      for (var entryIndex = position; entryIndex < end; entryIndex += 1) {
        salesRows.push({ row: block[validRows[entryIndex] - validRows[position]], sheetRow: validRows[entryIndex] });
      }
      position = end;
    }
  } else {
    salesRows = salesRows.map(function (row, index) { return { row: row, sheetRow: index + 2 }; });
  }
  var paymentRows = readSheetRows_(spreadsheet.getSheetByName(APP.sheets.payments), HEADERS.payments.length);
  var detailRows = readSheetRows_(spreadsheet.getSheetByName(APP.sheets.details), HEADERS.details.length);
  var paymentsBySale = {};
  var detailsBySale = {};
  var selectedSales = null;
  if (pageRows) {
    selectedSales = {};
    pageRows.forEach(function (entry) { selectedSales[String(entry.saleId || "")] = true; });
  }

  paymentRows.forEach(function (row) {
    var saleId = String(row[0] || "");
    if (!saleId || selectedSales && !selectedSales[saleId]) return;
    if (!paymentsBySale[saleId]) paymentsBySale[saleId] = [];
    paymentsBySale[saleId].push({
      method: String(row[2] || "").toLowerCase(),
      amount: asNumber_(row[3]),
      reference: String(row[4] || "")
    });
  });

  detailRows.forEach(function (row) {
    var saleId = String(row[0] || "");
    if (!saleId || selectedSales && !selectedSales[saleId]) return;
    if (!detailsBySale[saleId]) detailsBySale[saleId] = [];
    detailsBySale[saleId].push({
      lineId: String(row[2] || ""),
      menuItemId: String(row[3] || ""),
      name: String(row[4] || "Producto"),
      quantity: asNumber_(row[5]),
      unitPrice: asNumber_(row[6]),
      total: asNumber_(row[7]),
      cost: asNumber_(row[9]),
      profit: asNumber_(row[10]),notes:String(row[11]||'')
    });
  });

  var totals = {
    income: 0,
    sales: 0,
    subtotal: 0,
    discount: 0,
    tax: 0,
    service: 0,
    cost: 0,
    profit: 0,
    cash: 0,
    transfer: 0,
    breb: 0,
    card: 0,
    other: 0
  };
  var records = [];

  salesRows.forEach(function (entry) {
    var row = entry.row;
    var saleId = String(row[0] || "");
    if (!saleId) return;
    var dateKey = dateValueToKey_(row[5], timezone);
    if (!dateKey || dateKey < dateFrom || dateKey > dateTo) return;
    var saleTime = new Date(row[5]).getTime();
    if (intervalStart !== null && (!isFinite(saleTime) || saleTime < intervalStart || saleTime >= intervalEnd)) return;
    var total = asNumber_(row[12]);
    var payments = paymentsBySale[saleId] || [];
    if (!payments.length && row[13]) payments = [{ method: String(row[13]).toLowerCase(), amount: total, reference: String(row[14] || "") }];
    var isMixed = payments.length > 1 || String(row[13] || "").toLowerCase() === "mixed";
    if (methodFilter === "mixed" && !isMixed) return;
    if (methodFilter !== "all" && methodFilter !== "mixed" && !payments.some(function (payment) { return payment.method === methodFilter; })) return;
    var items = detailsBySale[saleId] || [];
    var searchText = normalizeSearch_([
      saleId, row[1], row[4], row[6], row[7], row[13], row[14],row[17],row[22],
      payments.map(function (payment) { return payment.method + " " + payment.reference; }).join(" "),
      items.map(function (item) { return item.name; }).join(" ")
    ].join(" "));
    if (query && searchText.indexOf(query) < 0) return;
    var cost = items.reduce(function (sum, item) { return sum + asNumber_(item.cost); }, 0);
    var record = {
      saleId: saleId,
      invoice: String(row[1] || ""),
      sessionId: String(row[2] || ""),
      table: String(row[4] || "Mesa"),
      date: String(row[5] instanceof Date ? row[5].toISOString() : row[5] || ""),
      payer: String(row[6] || ""),
      waiter: String(row[7] || ""),
      cashier:String(row[17]||''),cashierId:String(row[18]||''),webOrderId:String(row[19]||''),fulfillment:String(row[21]||''),cashierRole:String(row[22]||''),
      subtotal: asNumber_(row[8]),
      discount: asNumber_(row[9]),
      tax: asNumber_(row[10]),
      service: asNumber_(row[11]),
      total: total,
      cost: cost,
      profit: total - cost,
      reference: String(row[14] || ""),
      isMixed: isMixed,
      payments: payments,
      items: items
    };
    record.sheetRow = entry.sheetRow;
    records.push(record);
    totals.income += total;
    totals.sales += 1;
    totals.subtotal += record.subtotal;
    totals.discount += record.discount;
    totals.tax += record.tax;
    totals.service += record.service;
    totals.cost += cost;
    totals.profit += record.profit;
    payments.forEach(function (payment) {
      if (payment.method === "cash") totals.cash += payment.amount;
      else if (payment.method === "transfer") totals.transfer += payment.amount;
      else if (payment.method === "breb") totals.breb += payment.amount;
      else if (payment.method === "card") totals.card += payment.amount;
      else totals.other += payment.amount;
    });
  });

  records.sort(function (left, right) { return String(right.date).localeCompare(String(left.date)) || String(right.saleId).localeCompare(String(left.saleId)); });
  if ((PropertiesService.getScriptProperties().getProperty("DP_HISTORY_REVISION") || "") !== revision) return { stale: true, records: [] };
  if (pageRows) {
    var expectedIds = {};
    pageRows.forEach(function (entry) { expectedIds[entry.row] = String(entry.saleId || ""); });
    if (records.length !== pageRows.length || records.some(function (record) { return expectedIds[record.sheetRow] !== record.saleId; })) {
      return { stale: true, records: [] };
    }
    records.forEach(function (record) { delete record.sheetRow; });
    return { records: records, intervalApplied: true, generatedAt: new Date().toISOString() };
  }
  totals.averageTicket = totals.sales ? totals.income / totals.sales : 0;
  var totalRecords = records.length;
  var limit = Math.min(500, Math.max(50, asNumber_(filters.limit) || 300));
  var recordRows = records.map(function (record) { return { row: record.sheetRow, saleId: record.saleId }; });
  records.forEach(function (record) { delete record.sheetRow; });
  return {
    filters: { dateFrom: dateFrom, dateTo: dateTo, paymentMethod: methodFilter, query: String(filters.query || ""), startAt: filters.startAt || "", endAt: filters.endAt || "" },
    intervalApplied: true,
    totals: totals,
    records: records.slice(0, limit),
    recordRows: recordRows,
    revision: revision,
    totalRecords: totalRecords,
    truncated: totalRecords > limit,
    generatedAt: new Date().toISOString()
  };
}

function readSheetRows_(sheet, width) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
}

function dateValueToKey_(value, timezone) {
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, timezone, "yyyy-MM-dd");
  var text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? "" : Utilities.formatDate(parsed, timezone, "yyyy-MM-dd");
}

function normalizeSearch_(value) {
  var text = String(value || "").toLowerCase();
  try { text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (error) { /* Motor antiguo. */ }
  return text.replace(/\s+/g, " ").trim();
}

function upsertInventory_(item, user) {
  if (!item || !item.productId) throw new Error("Producto de inventario incompleto.");
  return withScriptLock_(function () {
    var table = readInventoryTable_();
    var rowIndex = findInventoryIndex_(table.rows, item.productId);
    var current = rowIndex >= 0 ? table.rows[rowIndex] : null;
    var next = inventoryObjectToRow_(item, current);
    var beforeStock = current ? asNumber_(current[7]) : 0;
    var afterStock = asNumber_(next[7]);
    var stockDelta = afterStock - beforeStock;
    if (rowIndex >= 0) table.rows[rowIndex] = next;
    else table.rows.push(next);
    writeInventoryRows_(table.sheet, table.rows);
    if (!current || stockDelta !== 0) {
      var movementType = safeText_(item.movementType) || (current ? (stockDelta > 0 ? "ENTRADA_EDICION" : "SALIDA_EDICION") : "NUEVO_PRODUCTO");
      var movementEventId = safeText_(item.movementEventId) || ("UPSERT-" + safeText_(item.productId) + "-" + new Date().getTime());
      appendRows_(getSpreadsheet_().getSheetByName(APP.sheets.movements), [[
        movementEventId, safeText_(item.productId), safeText_(next[1]),
        safeText_(next[2]), movementType, stockDelta, beforeStock, afterStock, asNumber_(next[5]), safeText_(item.movementReference || "FICHA_PRODUCTO"), "",
        new Date().toISOString(), safeText_(user.full_name || user.username)
      ]]);
    }
    appendAudit_("INVENTORY_UPSERT", item.productId, user.full_name || user.username, "OK", item.name || "Producto");
    return { item: inventoryRowToObject_(next), items: table.rows.filter(function (row) { return row[0]; }).map(inventoryRowToObject_) };
  });
}

function syncInventory_(items, user) {
  if (!Array.isArray(items)) throw new Error("Inventario invalido.");
  return withScriptLock_(function () {
    var table = readInventoryTable_();
    var rows = table.rows.slice();
    items.forEach(function (item) {
      if (!item || !item.productId) return;
      var rowIndex = findInventoryIndex_(rows, item.productId);
      var current = rowIndex >= 0 ? rows[rowIndex] : null;
      var next = inventoryObjectToRow_(item, current);
      if (rowIndex >= 0) rows[rowIndex] = next;
      else rows.push(next);
    });
    writeInventoryRows_(table.sheet, rows);
    appendAudit_("INVENTORY_SYNC", String(items.length), user.full_name || user.username, "OK", "Carga inicial de inventario");
    return { items: rows.filter(function (row) { return row[0]; }).map(inventoryRowToObject_) };
  });
}

function adjustInventory_(adjustment, user) {
  var eventId = String(adjustment && adjustment.eventId || "").trim();
  var productId = String(adjustment && adjustment.productId || "").trim();
  var delta = asNumber_(adjustment && adjustment.delta);
  if (!eventId || !productId || !delta) return { ok: false, retryable: false, error: "Movimiento de inventario incompleto." };
  return withScriptLock_(function () {
    var spreadsheet = getSpreadsheet_();
    var movementsSheet = spreadsheet.getSheetByName(APP.sheets.movements);
    var table = readInventoryTable_();
    var rowIndex = findInventoryIndex_(table.rows, productId);
    if (rowIndex < 0) return { ok: false, retryable: false, error: "El producto ya no existe en el inventario." };
    var currentRow = table.rows[rowIndex];
    if (hasValueInColumn_(movementsSheet, eventId, 1)) {
      return { duplicate: true, item: inventoryRowToObject_(currentRow) };
    }
    var reversesEventId = String(adjustment.reversesEventId || "").trim();
    if (reversesEventId && !hasValueInColumn_(movementsSheet, reversesEventId, 1)) {
      return { duplicate: true, skippedReversal: true, item: inventoryRowToObject_(currentRow) };
    }
    var before = asNumber_(currentRow[7]);
    var after = before + delta;
    if (after < 0) {
      return {
        ok: false,
        retryable: false,
        error: "No hay existencias suficientes para aplicar el consumo de " + String(currentRow[2] || adjustment.name || "este producto") + ".",
        item: inventoryRowToObject_(currentRow)
      };
    }
    var now = String(adjustment.occurredAt || new Date().toISOString());
    var requestedType = String(adjustment.movementType || "").trim().toUpperCase();
    var movementType = requestedType || (delta < 0 ? "CONSUMO_MESA" : "DEVOLUCION_CONSUMO");
    currentRow[7] = after;
    currentRow[10] = now;
    currentRow[11] = movementType + " " + eventId;
    currentRow[12] = asNumber_(currentRow[12]) + 1;
    table.sheet.getRange(rowIndex + 2, 1, 1, HEADERS.inventory.length).setValues([currentRow]);
    appendRows_(movementsSheet, [[
      safeText_(eventId), productId, safeText_(currentRow[1] || adjustment.code),
      safeText_(currentRow[2] || adjustment.name), movementType, delta, before, after,
      asNumber_(currentRow[5]), safeText_(adjustment.reference), safeText_(adjustment.sessionId), now,
      safeText_(user.full_name || user.username)
    ]]);
    appendAudit_("INVENTORY_CONSUMPTION", eventId, user.full_name || user.username, "OK", movementType + " " + delta);
    return { duplicate: false, item: inventoryRowToObject_(currentRow) };
  });
}

function setInventoryStock_(payload, user) {
  var productId = String(payload && payload.productId || "").trim();
  var stock = asNumber_(payload && payload.stock);
  if (!productId || stock < 0) return { ok: false, retryable: false, error: "La existencia indicada no es válida." };
  return withScriptLock_(function () {
    var table = readInventoryTable_();
    var rowIndex = findInventoryIndex_(table.rows, productId);
    if (rowIndex < 0) return { ok: false, retryable: false, error: "El producto ya no existe en el inventario." };
    var row = table.rows[rowIndex];
    row[7] = stock;
    row[10] = String(payload.updatedAt || new Date().toISOString());
    row[12] = asNumber_(row[12]) + 1;
    table.sheet.getRange(rowIndex + 2, 1, 1, HEADERS.inventory.length).setValues([row]);
    appendAudit_("INVENTORY_STOCK_CORRECTION", productId, user.full_name || user.username, "OK", "Existencia corregida a " + stock + " sin movimiento.");
    return { item: inventoryRowToObject_(row) };
  });
}

function consumptionAdjustedByProduct_(movementsSheet, sessionId) {
  var totals = {};
  var rows = readSheetRows_(movementsSheet, HEADERS.movements.length);
  rows.forEach(function (row) {
    if (String(row[10] || "") !== String(sessionId || "")) return;
    var type = String(row[4] || "");
    if (type !== "CONSUMO_MESA" && type !== "DEVOLUCION_CONSUMO") return;
    var productId = String(row[1] || "");
    if (!productId) return;
    totals[productId] = asNumber_(totals[productId]) - asNumber_(row[5]);
  });
  return totals;
}

function deleteInventory_(productId, user) {
  var cleanId = String(productId || "").trim();
  if (!cleanId) throw new Error("Producto de inventario invalido.");
  return withScriptLock_(function () {
    var table = readInventoryTable_();
    var rowIndex = findInventoryIndex_(table.rows, cleanId);
    if (rowIndex >= 0) table.sheet.deleteRow(rowIndex + 2);
    appendAudit_("INVENTORY_DELETE", cleanId, user.full_name || user.username, "OK", rowIndex >= 0 ? "Producto eliminado" : "Producto ya no existia");
    return { deleted: rowIndex >= 0, productId: cleanId };
  });
}

function clearInventory_(user, authToken) {
  return withScriptLock_(function () {
    var spreadsheet = getSpreadsheet_();
    var inventorySheet = spreadsheet.getSheetByName(APP.sheets.inventory);
    var deleted = Math.max(0, inventorySheet.getLastRow() - 1);
    var config = getConfig_();
    var url = config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/menu_items?id=not.is.null";
    deleteSupabaseRows_(url, authToken, config, "No se pudo vaciar el catálogo operativo en Supabase.");
    writeInventoryRows_(inventorySheet, []);
    appendAudit_("INVENTORY_CLEAR_ALL", String(deleted), user.full_name || user.username, "OK", "Inventario reiniciado desde el panel.");
    return { cleared: true, deleted: deleted, items: [] };
  });
}

function clearInventoryMovements_(user) {
  return withScriptLock_(function () {
    var sheet = getSpreadsheet_().getSheetByName(APP.sheets.movements);
    var deleted = Math.max(0, sheet.getLastRow() - 1);
    writeDataRows_(sheet, [], HEADERS.movements.length);
    appendAudit_("INVENTORY_MOVEMENTS_CLEAR_ALL", String(deleted), user.full_name || user.username, "OK", "Historial de movimientos reiniciado desde el panel.");
    return { cleared: true, deleted: deleted, movements: [] };
  });
}

function clearIncome_(user) {
  return withScriptLock_(function () {
    var spreadsheet = getSpreadsheet_();
    var salesSheet = spreadsheet.getSheetByName(APP.sheets.sales);
    var deleted = Math.max(0, salesSheet.getLastRow() - 1);
    writeDataRows_(salesSheet, [], HEADERS.sales.length);
    writeDataRows_(spreadsheet.getSheetByName(APP.sheets.details), [], HEADERS.details.length);
    writeDataRows_(spreadsheet.getSheetByName(APP.sheets.payments), [], HEADERS.payments.length);
    var dailySheet = spreadsheet.getSheetByName(APP.sheets.daily);
    writeDataRows_(dailySheet, [], Math.max(HEADERS.daily.length, dailySheet.getLastColumn()));
    appendAudit_("INCOME_CLEAR_ALL", String(deleted), user.full_name || user.username, "OK", "Ingresos reiniciados desde el panel sin modificar existencias.");
    return { cleared: true, deleted: deleted };
  });
}

// One pending remote sale is completed before any later inventory mutation.
// The plan is durable before applying stock; all effects have stable identities.
var POS_SALE_JOURNAL = "POS_Operaciones";
var POS_PENDING_SALE = "DP_PENDING_SALE_V1";
function saleJournalSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(POS_SALE_JOURNAL);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(POS_SALE_JOURNAL);
    sheet.getRange(1, 1, 1, 6).setValues([["sale_id", "session_id", "estado", "partes", "actualizado_en", "plan_1"]]);
  }
  return sheet;
}
function findSaleJournalRow_(sheet, saleId) {
  if (sheet.getLastRow() < 2) return 0;
  var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(saleId)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}
function existingSaleRow_(sheet, saleId, sessionId) {
  if (sheet.getLastRow() < 2) return null;
  var found = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(String(saleId)).matchEntireCell(true).findNext();
  if (!found && sessionId) found = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).createTextFinder(String(sessionId)).matchEntireCell(true).findNext();
  return found ? sheet.getRange(found.getRow(), 1, 1, HEADERS.sales.length).getValues()[0] : null;
}
function prepareSaleJournal_(spreadsheet, plan) {
  var properties = PropertiesService.getScriptProperties();
  var sheet = saleJournalSheet_(spreadsheet);
  properties.setProperty(POS_PENDING_SALE, plan.saleId);
  var text = JSON.stringify(plan), chunks = [];
  for (var offset = 0; offset < text.length; offset += 28000) chunks.push(text.slice(offset, offset + 28000));
  var row = sheet.getLastRow() + 1, columns = 5 + chunks.length;
  if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  sheet.getRange(row, 1, 1, columns).setValues([[plan.saleId, plan.sessionId, "pending", chunks.length, new Date().toISOString()].concat(chunks)]);
  SpreadsheetApp.flush();
  return { row: row };
}
function applySaleJournal_(spreadsheet, journalRow, plan) {
  if (plan.kind === "mutation") {
    plan.tables.forEach(function (table) {
      var sheet = spreadsheet.getSheetByName(APP.sheets[table.key]);
      var current = readSheetRows_(sheet, table.width);
      if (table.key === "movements") {
        var ids = {}; current.forEach(function (row) { ids[String(row[0])] = true; });
        appendRows_(sheet, table.rows.filter(function (row) { return !ids[String(row[0])]; }));
      } else if (table.key === "inventory") {
        var after = {}; table.rows.forEach(function (row) { after[String(row[0])] = row; });
        writeDataRows_(sheet, current.map(function (row) { return after[String(row[0])] || row; }), table.width);
      } else {
        writeDataRows_(sheet, current.filter(function (row) { return String(row[0]) !== String(plan.targetSaleId); }).concat(table.rows), table.width);
      }
    });
    rebuildDailyIncome_(spreadsheet);
    saleJournalSheet_(spreadsheet).getRange(journalRow, 3).setValue("committed");
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().deleteProperty(POS_PENDING_SALE);
    return;
  }
  var inventory = readInventoryTable_();
  var rows = inventory.rows.map(function (row) { return row.slice(); });
  (plan.inventoryChanges || []).forEach(function (change) {
    var index = findInventoryIndex_(rows, change.after[0]);
    var current = index < 0 ? null : rows[index];
    var matches = function (left, right) {
      return !left || !right ? left === right : String(left[0]) === String(right[0])
        && asNumber_(left[7]) === asNumber_(right[7]) && String(left[11] || "") === String(right[11] || "")
        && asNumber_(left[12]) === asNumber_(right[12]);
    };
    if (matches(current, change.after)) return;
    if (!matches(current, change.before)) throw new Error("El inventario cambió fuera del cobro pendiente " + plan.saleId + ". Revisa POS_Operaciones antes de continuar.");
    if (index < 0) rows.push(change.after); else rows[index] = change.after;
  });
  writeInventoryRows_(inventory.sheet, rows);
  var movements = spreadsheet.getSheetByName(APP.sheets.movements);
  appendRows_(movements, (plan.movements || []).filter(function (row) { return !hasValueInColumn_(movements, row[0], 1); }));
  var details = spreadsheet.getSheetByName(APP.sheets.details), payments = spreadsheet.getSheetByName(APP.sheets.payments);
  if (!hasValueInColumn_(details, plan.saleId, 1)) appendRows_(details, plan.details || []);
  if (!hasValueInColumn_(payments, plan.saleId, 1)) appendRows_(payments, plan.payments || []);
  var sales = spreadsheet.getSheetByName(APP.sheets.sales);
  if (!existingSaleRow_(sales, plan.saleId, plan.sessionId)) appendRows_(sales, [plan.saleRow]);
  updateDailyIncome_(spreadsheet.getSheetByName(APP.sheets.daily), plan.invoice, plan.totalCost, plan.saleId);
  if(plan.invoice.webOrderId)dpFinishWebSale_(plan.invoice);
  saleJournalSheet_(spreadsheet).getRange(journalRow, 3).setValue("committed");
  SpreadsheetApp.flush();
  PropertiesService.getScriptProperties().deleteProperty(POS_PENDING_SALE);
}
function recoverPendingSaleJournal_() {
  var properties = PropertiesService.getScriptProperties(), saleId = properties.getProperty(POS_PENDING_SALE);
  if (!saleId) return;
  var spreadsheet = getSpreadsheet_(), sheet = saleJournalSheet_(spreadsheet);
  var row = findSaleJournalRow_(sheet, saleId);
  if (!row) { properties.deleteProperty(POS_PENDING_SALE); return; }
  var metadata = sheet.getRange(row, 1, 1, 5).getValues()[0];
  if (String(metadata[2]) === "committed") { properties.deleteProperty(POS_PENDING_SALE); return; }
  var count = Number(metadata[3]);
  if (!Number.isInteger(count) || count < 1) throw new Error("Plan de cobro incompleto en POS_Operaciones: " + saleId);
  var plan = JSON.parse(sheet.getRange(row, 6, 1, count).getValues()[0].join(""));
  if (String(plan.saleId) !== String(saleId)) throw new Error("Identidad de cobro inconsistente en POS_Operaciones.");
  applySaleJournal_(spreadsheet, row, plan);
}

function dpWebSaleOrder_(invoice){
  var sheet=getSpreadsheet_().getSheetByName(DP_TABLES.orders.name),last=sheet.getLastRow();
  var found=last>1?sheet.getRange(2,1,last-1,1).createTextFinder(String(invoice.webOrderId)).matchEntireCell(true).findNext():null;
  if(found){var row=found.getRow(),cells=sheet.getRange(row,1,1,DP_TABLES.orders.headers.length).getValues()[0];return {sheet:sheet,row:row,cells:cells,order:dpObjects_('orders',[cells])[0]};}
  throw new Error('El pedido web ya no existe.');
}
function dpValidateWebSale_(invoice){
  var found=dpWebSaleOrder_(invoice),order=found.order;
  if(order.status==='cobrada'||order.status==='eliminada'){
    var error=new Error(order.status==='cobrada'?'Este pedido ya fue cobrado. Revisa Ventas.':'El pedido fue eliminado.');error.retryable=false;error.alreadyPaid=order.status==='cobrada';throw error;
  }
  if(invoice.id!=='walk-in-web-'+order.id||invoice.sessionId!==invoice.id||invoice.saleChannel!=='walk_in'||!invoice.checkoutId)throw new Error('Identidad de cobro inválida.');
  var delivery=order.deliveryFeePending?dpMoney_(invoice.webDeliveryFee):Number(order.deliveryFee||0);
  var expected=Number(order.subtotal)+Number(order.packagingFee||0)+delivery;
  var subtotal=(invoice.items||[]).reduce(function(sum,line){return sum+Number(line.quantity)*Number(line.unit_price);},0);
  var paid=(invoice.payments||[]).reduce(function(sum,p){return sum+Number(p.amount);},0);
  if(subtotal!==expected||Number(invoice.totals.total)-Number(invoice.tipAmount||0)!==expected||paid!==Number(invoice.totals.total))throw new Error('El importe del pedido cambió. Revisa el pedido antes de cobrar.');
}
function dpFinishWebSale_(invoice){
  var found=dpWebSaleOrder_(invoice),row=found.cells,headers=DP_TABLES.orders.headers;
  if(row[5]==='cobrada')return;
  if(found.order.deliveryFeePending){row[11]=Number(invoice.webDeliveryFee);row[13]=Number(found.order.subtotal)+Number(found.order.packagingFee||0)+Number(invoice.webDeliveryFee);row[headers.indexOf('deliveryFeePending')]=false;}
  row[5]='cobrada';row[4]=new Date().toISOString();row[20]=safeText_(invoice.cashierName);row[21]=Number(row[21]||0)+1;
  found.sheet.getRange(found.row,1,1,headers.length).setValues([row]);
  var props=PropertiesService.getScriptProperties(),revision=Utilities.getUuid();props.setProperty('DP_ORDERS_REVISION',revision);props.setProperty('DP_HISTORY_REVISION',revision);props.setProperty('DP_MOVEMENT_REVISION',revision);props.setProperty('DP_INVENTORY_INITIALIZED','1');
}
function recordSale_(invoice, user, authToken) {
  if (!invoice || !invoice.sessionId || !invoice.totals) throw new Error("Factura incompleta.");
  return withScriptLock_(function () {
    var saleId = safeText_(invoice.id || invoice.sessionId);
    var sessionId = safeText_(invoice.sessionId);
    var spreadsheet = getSpreadsheet_();
    var salesSheet = spreadsheet.getSheetByName(APP.sheets.sales);
    if (saleExists_(salesSheet, saleId, sessionId)) {
      var canonical = existingSaleRow_(salesSheet, saleId, sessionId);
      if (!canonical) throw new Error("No se pudo verificar la venta existente. Se conserva el reintento.");
      var canonicalId = String(canonical[0]);
      if(invoice.webOrderId&&String(canonical[20]||'')!==String(invoice.checkoutId||''))return {ok:false,retryable:false,alreadyPaid:true,error:'Este pedido ya fue cobrado. Revisa la factura en Ventas.'};
      var canonicalInvoice = { id: canonicalId, sessionId: String(canonical[2]), createdAt: canonical[5],
        totals: { total: asNumber_(canonical[12]), discount: asNumber_(canonical[9]), tax: asNumber_(canonical[10]), serviceFee: asNumber_(canonical[11]) },
        payments: readSheetRows_(spreadsheet.getSheetByName(APP.sheets.payments), HEADERS.payments.length)
          .filter(function (row) { return String(row[0]) === canonicalId; })
          .map(function (row) { return { method: String(row[2]), amount: asNumber_(row[3]) }; }) };
      var canonicalCost = readSheetRows_(spreadsheet.getSheetByName(APP.sheets.details), HEADERS.details.length)
        .filter(function (row) { return String(row[0]) === canonicalId; })
        .reduce(function (total, row) { return total + asNumber_(row[9]); }, 0);
      var paymentSignature = function (payments) { return (payments || []).map(function (p) { return String(p.method) + ":" + asNumber_(p.amount); }).sort().join("|"); };
      if (asNumber_(invoice.totals.total) !== asNumber_(canonical[12])
          || paymentSignature(invoice.payments) !== paymentSignature(canonicalInvoice.payments)) {
        return { ok: false, conflict: true, retryable: false, saleId: canonicalId, error: "La cuenta ya tiene otra factura o distribución de pago. Revisa la venta existente; no se creó otro cobro." };
      }
      updateDailyIncome_(spreadsheet.getSheetByName(APP.sheets.daily), canonicalInvoice, canonicalCost, canonicalId);
      if (invoice.saleChannel !== "walk_in") archiveSupabaseSession_(sessionId, authToken);
      return { duplicate: true, saleId: canonicalId, archivedSessionId: sessionId, items: getInventory_().items };
    }

    var now = new Date().toISOString();
    if(invoice.webOrderId){dpValidateWebSale_(invoice);invoice.cashierName=user.full_name||user.username;invoice.cashierId=user.id;invoice.cashierRole=user.role;}
    var totals = invoice.totals || {};
    var saleRow = [[
      saleId, safeText_(invoice.number), sessionId, safeText_(invoice.tableId), safeText_(invoice.table),
      safeText_(invoice.createdAt || now), safeText_(invoice.payerName), safeText_(invoice.waiterName),
      asNumber_(totals.subtotal), asNumber_(totals.discount), asNumber_(totals.tax),
      asNumber_(totals.serviceFee), asNumber_(totals.total), safeText_(invoice.paymentMethod),
      safeText_(invoice.reference), invoice.webOrderId?'Pedido en linea/AppScript':invoice.saleChannel === "walk_in" ? "Venta individual/AppScript" : "Supabase/Panel", now,
      safeText_(invoice.cashierName||user.full_name||user.username),safeText_(invoice.cashierId||user.id),safeText_(invoice.webOrderId),safeText_(invoice.checkoutId),safeText_(invoice.fulfillment),safeText_(invoice.cashierRole||user.role)
    ]];

    var inventoryTable = readInventoryTable_();
    var inventoryRows = inventoryTable.rows.slice();
    var inventoryBefore = {};
    inventoryTable.rows.forEach(function (row) { inventoryBefore[String(row[0])] = row.slice(); });
    var movementsSheet = spreadsheet.getSheetByName(APP.sheets.movements);
    var adjustedByProduct = consumptionAdjustedByProduct_(movementsSheet, sessionId);
    var details = [];
    var movements = [];
    var processedProducts = {};
    var totalCost = 0;
    (invoice.items || []).forEach(function (line) {
      var productId = safeText_(line.menu_item_id);
      var quantity = Math.max(0, asNumber_(line.quantity));
      var unitPrice = Math.max(0, asNumber_(line.unit_price));
      var cost = 0;
      var before = 0;
      var after = 0;
      var code = "";
      if (productId) {
        var inventoryIndex = findInventoryIndex_(inventoryRows, productId);
        if (inventoryIndex < 0) {
          inventoryRows.push(inventoryObjectToRow_({
            productId: productId,
            code: acronym_(line.item_name),
            name: line.item_name,
            unit: "unidad",
            costPrice: 0,
            salePrice: unitPrice,
            stock: 0,
            minStock: 0,
            isAvailable: true
          }, null));
          inventoryIndex = inventoryRows.length - 1;
        }
        var inventoryRow = inventoryRows[inventoryIndex];
        code = safeText_(inventoryRow[1]);
        cost = line.unit_cost !== undefined && line.unit_cost !== null && line.unit_cost !== "" ? Math.max(0, asNumber_(line.unit_cost)) : asNumber_(inventoryRow[5]);
        if (!processedProducts[productId]) {
          var productQuantity = (invoice.items || []).filter(function (entry) {
            return safeText_(entry.menu_item_id) === productId;
          }).reduce(function (sum, entry) { return sum + Math.max(0, asNumber_(entry.quantity)); }, 0);
          var alreadyAdjusted = Math.max(0, asNumber_(adjustedByProduct[productId]));
          var reconciliationDelta = alreadyAdjusted - productQuantity;
          var movementMarker = "VENTA " + saleId;
          if (String(inventoryRow[11] || "") === movementMarker) {
            after = asNumber_(inventoryRow[7]);
            before = after - reconciliationDelta;
          } else {
            before = asNumber_(inventoryRow[7]);
            after = Math.max(0, before + reconciliationDelta);
            if (reconciliationDelta !== 0) {
              inventoryRow[7] = after;
              inventoryRow[10] = now;
              inventoryRow[11] = movementMarker;
              inventoryRow[12] = asNumber_(inventoryRow[12]) + 1;
              inventoryRows[inventoryIndex] = inventoryRow;
            }
          }
          if (reconciliationDelta !== 0) {
            movements.push([
              "SALE-" + saleId + "-" + productId, productId, code, safeText_(line.item_name), reconciliationDelta < 0 ? "SALIDA_VENTA" : "DEVOLUCION_VENTA", reconciliationDelta,
              before, after, cost, safeText_(invoice.number), sessionId, safeText_(invoice.createdAt || now),
              safeText_(user.full_name || user.username)
            ]);
          }
          processedProducts[productId] = true;
        }
      }
      var lineTotal = quantity * unitPrice;
      var lineCost = quantity * cost;
      totalCost += lineCost;
      details.push([
        saleId, safeText_(invoice.number), safeText_(line.id), productId, safeText_(line.item_name),
        quantity, unitPrice, lineTotal, cost, lineCost, lineTotal - lineCost, safeText_(line.notes)
      ]);
    });

    var payments = (invoice.payments || []).map(function (payment) {
      return [saleId, safeText_(invoice.number), safeText_(payment.method), asNumber_(payment.amount), safeText_(invoice.reference), safeText_(invoice.createdAt || now)];
    });

    var plan = {
      saleId: saleId, sessionId: sessionId, invoice: invoice, totalCost: totalCost,
      saleRow: saleRow[0], details: details, payments: payments, movements: movements,
      inventoryChanges: inventoryRows.filter(function (row) { return processedProducts[String(row[0])]; })
        .map(function (row) { return { before: inventoryBefore[String(row[0])] || null, after: row }; })
    };
    var pending = prepareSaleJournal_(spreadsheet, plan);
    applySaleJournal_(spreadsheet, pending.row, plan);
    if (invoice.saleChannel !== "walk_in") archiveSupabaseSession_(sessionId, authToken);
    CacheService.getScriptCache().put("sale_" + hash_(saleId + "|" + sessionId), "1", 21600);
    appendAudit_("SALE", saleId, user.full_name || user.username, "OK", safeText_(invoice.number));
    return {
      duplicate: false,
      saleId: saleId,
      archivedSessionId: sessionId,
      invoiceNumber: safeText_(invoice.number),
      items: inventoryRows.filter(function (row) { return row[0]; }).map(inventoryRowToObject_)
    };
  });
}

function writeDataRows_(sheet, rows, width) {
  var previous = Math.max(0, sheet.getLastRow() - 1);
  if (rows.length) sheet.getRange(2, 1, rows.length, width).setValues(rows);
  if (previous > rows.length) sheet.getRange(rows.length + 2, 1, previous - rows.length, width).clearContent();
}

function editSale_(invoice, user, operationId) {
  if (!invoice || !invoice.id || !invoice.totals || !Array.isArray(invoice.items) || !invoice.items.length) throw new Error("Correccion de venta incompleta.");
  return withScriptLock_(function () {
    var duplicate = salesMutationResult_(operationId);
    if (duplicate) return duplicate;
    var spreadsheet = getSpreadsheet_();
    var saleId = safeText_(invoice.id);
    var salesSheet = spreadsheet.getSheetByName(APP.sheets.sales);
    var detailsSheet = spreadsheet.getSheetByName(APP.sheets.details);
    var paymentsSheet = spreadsheet.getSheetByName(APP.sheets.payments);
    var movementsSheet = spreadsheet.getSheetByName(APP.sheets.movements);
    var sales = readSheetRows_(salesSheet, HEADERS.sales.length);
    var saleIndex = -1;
    for (var index = 0; index < sales.length; index += 1) if (String(sales[index][0] || "") === saleId) { saleIndex = index; break; }
    if (saleIndex < 0) throw new Error("No se encontro la venta que deseas corregir.");

    var oldDetails = readSheetRows_(detailsSheet, HEADERS.details.length);
    var oldSaleDetails = oldDetails.filter(function (row) { return String(row[0] || "") === saleId; });
    var oldQuantityByProduct = {};
    oldSaleDetails.forEach(function (row) {
      var productId = String(row[3] || "");
      if (productId) oldQuantityByProduct[productId] = asNumber_(oldQuantityByProduct[productId]) + asNumber_(row[5]);
    });
    var newQuantityByProduct = {};
    invoice.items.forEach(function (line) {
      var productId = safeText_(line.menu_item_id);
      if (productId) newQuantityByProduct[productId] = asNumber_(newQuantityByProduct[productId]) + Math.max(0, asNumber_(line.quantity));
    });

    var inventory = readInventoryTable_();
    var editMovements = [];
    var productIds = {};
    Object.keys(oldQuantityByProduct).concat(Object.keys(newQuantityByProduct)).forEach(function (id) { productIds[id] = true; });
    Object.keys(productIds).forEach(function (productId) {
      var inventoryIndex = findInventoryIndex_(inventory.rows, productId);
      if (inventoryIndex < 0) return;
      var row = inventory.rows[inventoryIndex];
      var delta = asNumber_(oldQuantityByProduct[productId]) - asNumber_(newQuantityByProduct[productId]);
      if (!delta) return;
      var before = asNumber_(row[7]);
      var after = before + delta;
      if (after < 0) throw new Error("La correccion requiere mas existencias de " + String(row[2] || "un producto") + " de las disponibles.");
      row[7] = after;
      row[10] = new Date().toISOString();
      row[11] = "CORRECCION_VENTA " + saleId;
      row[12] = asNumber_(row[12]) + 1;
      inventory.rows[inventoryIndex] = row;
      editMovements.push(["EDIT-" + saleId + "-" + productId + "-" + new Date().getTime(), productId, safeText_(row[1]), safeText_(row[2]), "CORRECCION_VENTA", delta, before, after, asNumber_(row[5]), safeText_(invoice.number), safeText_(invoice.sessionId), new Date().toISOString(), safeText_(user.full_name || user.username)]);
    });


    var totals = invoice.totals || {};
    var sale = sales[saleIndex];
    sale[1] = safeText_(invoice.number || sale[1]);
    sale[4] = safeText_(invoice.table);
    sale[5] = safeText_(invoice.createdAt);
    sale[6] = safeText_(invoice.payerName);
    sale[7] = safeText_(invoice.waiterName);
    sale[8] = asNumber_(totals.subtotal);
    sale[9] = asNumber_(totals.discount);
    sale[10] = asNumber_(totals.tax);
    sale[11] = asNumber_(totals.serviceFee);
    sale[12] = asNumber_(totals.total);
    sale[13] = safeText_(invoice.paymentMethod);
    sale[14] = safeText_(invoice.reference);
    sale[16] = new Date().toISOString();
    sales[saleIndex] = sale;


    var nextDetails = oldDetails.filter(function (row) { return String(row[0] || "") !== saleId; });
    invoice.items.forEach(function (line) {
      var inventoryIndex = findInventoryIndex_(inventory.rows, line.menu_item_id);
      var cost = line.unit_cost !== undefined && line.unit_cost !== null && line.unit_cost !== "" ? Math.max(0, asNumber_(line.unit_cost)) : (inventoryIndex >= 0 ? asNumber_(inventory.rows[inventoryIndex][5]) : 0);
      var quantity = Math.max(0, asNumber_(line.quantity));
      var price = Math.max(0, asNumber_(line.unit_price));
      nextDetails.push([saleId, safeText_(invoice.number), safeText_(line.id), safeText_(line.menu_item_id), safeText_(line.item_name), quantity, price, quantity * price, cost, quantity * cost, quantity * (price - cost), safeText_(line.notes)]);
    });


    var oldPayments = readSheetRows_(paymentsSheet, HEADERS.payments.length).filter(function (row) { return String(row[0] || "") !== saleId; });
    (invoice.payments || []).forEach(function (payment) { oldPayments.push([saleId, safeText_(invoice.number), safeText_(payment.method), asNumber_(payment.amount), safeText_(invoice.reference), safeText_(invoice.createdAt)]); });
    commitSalesMutation_(spreadsheet, operationId, [
      { key: "inventory", rows: inventory.rows, width: HEADERS.inventory.length },
      { key: "movements", rows: editMovements, width: HEADERS.movements.length },
      { key: "sales", rows: sales, width: HEADERS.sales.length },
      { key: "details", rows: nextDetails, width: HEADERS.details.length },
      { key: "payments", rows: oldPayments, width: HEADERS.payments.length }
    ], { saleId: saleId, corrected: true });
    appendAudit_("SALE_EDIT", saleId, user.full_name || user.username, "OK", "Venta corregida desde el panel");
    return { saleId: saleId, corrected: true, items: inventory.rows.filter(function (row) { return row[0]; }).map(inventoryRowToObject_) };
  });
}

function deleteSale_(saleIdValue, user, operationId) {
  var saleId = safeText_(saleIdValue);
  if (!saleId) throw new Error("Venta inválida.");
  return withScriptLock_(function () {
    var duplicate = salesMutationResult_(operationId);
    if (duplicate) return duplicate;
    var spreadsheet = getSpreadsheet_();
    var salesSheet = spreadsheet.getSheetByName(APP.sheets.sales);
    var detailsSheet = spreadsheet.getSheetByName(APP.sheets.details);
    var paymentsSheet = spreadsheet.getSheetByName(APP.sheets.payments);
    var movementsSheet = spreadsheet.getSheetByName(APP.sheets.movements);
    var sales = readSheetRows_(salesSheet, HEADERS.sales.length);
    var sale = null;
    var remainingSales = sales.filter(function (row) {
      if (String(row[0] || "") === saleId) { sale = row; return false; }
      return true;
    });
    if (!sale) return { deleted: false, saleId: saleId, items: readInventoryTable_().rows.filter(function (row) { return row[0]; }).map(inventoryRowToObject_) };

    var details = readSheetRows_(detailsSheet, HEADERS.details.length);
    var deletedDetails = details.filter(function (row) { return String(row[0] || "") === saleId; });
    var remainingDetails = details.filter(function (row) { return String(row[0] || "") !== saleId; });
    var payments = readSheetRows_(paymentsSheet, HEADERS.payments.length);
    var remainingPayments = payments.filter(function (row) { return String(row[0] || "") !== saleId; });
    var inventory = readInventoryTable_();
    var quantities = {};
    deletedDetails.forEach(function (row) {
      var productId = String(row[3] || "");
      if (productId) quantities[productId] = asNumber_(quantities[productId]) + Math.max(0, asNumber_(row[5]));
    });
    var now = new Date().toISOString();
    var restoredMovements = [];
    Object.keys(quantities).forEach(function (productId) {
      var inventoryIndex = findInventoryIndex_(inventory.rows, productId);
      if (inventoryIndex < 0) return;
      var row = inventory.rows[inventoryIndex];
      var before = asNumber_(row[7]);
      var after = before + quantities[productId];
      row[7] = after;
      row[10] = now;
      row[11] = "VENTA_ELIMINADA " + saleId;
      row[12] = asNumber_(row[12]) + 1;
      inventory.rows[inventoryIndex] = row;
      restoredMovements.push(["DELETE-SALE-" + saleId + "-" + productId, productId, safeText_(row[1]), safeText_(row[2]), "VENTA_ELIMINADA", quantities[productId], before, after, asNumber_(row[5]), safeText_(sale[1]), safeText_(sale[2]), now, safeText_(user.full_name || user.username)]);
    });

    commitSalesMutation_(spreadsheet, operationId, [
      { key: "inventory", rows: inventory.rows, width: HEADERS.inventory.length },
      { key: "movements", rows: restoredMovements, width: HEADERS.movements.length },
      { key: "sales", rows: remainingSales, width: HEADERS.sales.length },
      { key: "details", rows: remainingDetails, width: HEADERS.details.length },
      { key: "payments", rows: remainingPayments, width: HEADERS.payments.length }
    ], { deleted: true, saleId: saleId, restoredProducts: Object.keys(quantities).length });
    appendAudit_("SALE_DELETE", saleId, user.full_name || user.username, "OK", "Venta eliminada desde el panel: " + safeText_(sale[1]));
    return { deleted: true, saleId: saleId, restoredProducts: Object.keys(quantities).length, items: inventory.rows.filter(function (row) { return row[0]; }).map(inventoryRowToObject_) };
  });
}

function rebuildDailyIncome_(spreadsheet) {
  var groups = {}, costs = {}, paymentsBySale = {};
  readSheetRows_(spreadsheet.getSheetByName(APP.sheets.details), HEADERS.details.length).forEach(function (row) {
    costs[String(row[0])] = asNumber_(costs[String(row[0])]) + asNumber_(row[9]);
  });
  readSheetRows_(spreadsheet.getSheetByName(APP.sheets.payments), HEADERS.payments.length).forEach(function (row) {
    var id = String(row[0]); if (!paymentsBySale[id]) paymentsBySale[id] = [];
    paymentsBySale[id].push(row);
  });
  readSheetRows_(spreadsheet.getSheetByName(APP.sheets.sales), HEADERS.sales.length).forEach(function (sale) {
    var id = String(sale[0] || ""); if (!id) return;
    var date = Utilities.formatDate(new Date(sale[5]), getTimezone_(), "yyyy-MM-dd");
    var row = groups[date] || (groups[date] = [date,0,0,0,0,0,0,0,0,0,0,new Date().toISOString(),"",0]);
    row[1]++; row[2] += asNumber_(sale[12]);
    (paymentsBySale[id] || []).forEach(function (payment) {
      var col = { cash:3, transfer:4, breb:5, card:13 }[String(payment[2])];
      if (col !== undefined) row[col] += asNumber_(payment[3]);
    });
    row[6] += asNumber_(sale[9]); row[7] += asNumber_(sale[10]); row[8] += asNumber_(sale[11]);
    row[9] += asNumber_(costs[id]); row[10] += asNumber_(sale[12]) - asNumber_(costs[id]);
    var col = row.length > 14 ? row.length - 1 : 12, marker = "|" + id + "|";
    if (String(row[col]).length + marker.length > 28000) { col = Math.max(14, row.length); row[col] = ""; }
    row[col] += marker;
  });
  var sheet = spreadsheet.getSheetByName(APP.sheets.daily);
  var rows = Object.keys(groups).sort().map(function (key) { return groups[key]; });
  var width = Math.max.apply(null, [HEADERS.daily.length, sheet.getLastColumn()].concat(rows.map(function (row) { return row.length; })));
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  rows.forEach(function (row) { while (row.length < width) row.push(""); });
  writeDataRows_(sheet, rows, width);
}

function archiveSupabaseSession_(sessionId, authToken) {
  // Las ventas individuales se originan y cierran en Apps Script. Solo las
  // sesiones UUID de mesas necesitan la limpieza remota de Supabase.
  if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(sessionId))) return false;
  var config = getConfig_();
  var baseUrl = config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/";
  var encodedSession = encodeURIComponent(sessionId);
  deleteSupabaseRows_(baseUrl + "service_requests?session_id=eq." + encodedSession, authToken, config);
  deleteSupabaseRows_(baseUrl + "session_items?session_id=eq." + encodedSession, authToken, config);
  deleteSupabaseRows_(baseUrl + "table_sessions?id=eq." + encodedSession + "&status=eq.closed", authToken, config);
  return true;
}

function deleteSupabaseRows_(url, authToken, config, errorMessage) {
  var response = UrlFetchApp.fetch(url, {
    method: "delete",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: "Bearer " + config.supabaseAnonKey,
      "x-app-token": String(authToken || ""),
      Prefer: "return=minimal"
    },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(errorMessage || "La venta se archivo, pero Supabase no permitio limpiar la sesion cerrada. Se reintentara.");
  }
}

function readInventoryTable_() {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(APP.sheets.inventory);
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, HEADERS.inventory.length).getValues() : [];
  return { sheet: sheet, rows: rows };
}

function writeInventoryRows_(sheet, rows) {
  var width = HEADERS.inventory.length;
  var previousDataRows = Math.max(0, sheet.getLastRow() - 1);
  if (rows.length) sheet.getRange(2, 1, rows.length, width).setValues(rows);
  if (previousDataRows > rows.length) sheet.getRange(2 + rows.length, 1, previousDataRows - rows.length, width).clearContent();
}

function inventoryObjectToRow_(item, current) {
  var now = new Date().toISOString();
  var base = current || new Array(HEADERS.inventory.length).fill("");
  return [
    safeText_(item.productId),
    safeText_(String(item.code || acronym_(item.name)).toUpperCase()),
    safeText_(item.name),
    safeText_(item.category),
    safeText_(item.unit || "unidad"),
    Math.max(0, asNumber_(item.costPrice)),
    Math.max(0, asNumber_(item.salePrice)),
    Math.max(0, asNumber_(item.stock)),
    Math.max(0, asNumber_(item.minStock)),
    item.isAvailable !== false,
    now,
    safeText_(base[11] || "AJUSTE"),
    asNumber_(base[12]) + 1,
    safeText_(item.notes || base[13])
  ];
}

function inventoryRowToObject_(row) {
  return {
    productId: String(row[0] || ""),
    code: String(row[1] || ""),
    name: String(row[2] || ""),
    category: String(row[3] || ""),
    unit: String(row[4] || "unidad"),
    costPrice: asNumber_(row[5]),
    salePrice: asNumber_(row[6]),
    stock: asNumber_(row[7]),
    minStock: asNumber_(row[8]),
    isAvailable: row[9] !== false,
    updatedAt: String(row[10] || ""),
    version: asNumber_(row[12])
  };
}

function updateDailyIncome_(sheet, invoice, totalCost, saleId) {
  var dateKey = Utilities.formatDate(new Date(invoice.createdAt || Date.now()), getTimezone_(), "yyyy-MM-dd");
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, Math.max(HEADERS.daily.length, sheet.getLastColumn())).getValues() : [];
  var targetIndex = -1;
  for (var index = 0; index < rows.length; index += 1) {
    var existingDate = rows[index][0] instanceof Date
      ? Utilities.formatDate(rows[index][0], getTimezone_(), "yyyy-MM-dd")
      : String(rows[index][0] || "");
    if (existingDate === dateKey) { targetIndex = index; break; }
  }
  var row = targetIndex >= 0 ? rows[targetIndex] : [dateKey, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "", ""];
  row[13] = asNumber_(row[13]);
  var processedChunks = [String(row[12] || "")].concat(row.slice(14).map(function (part) { return String(part || ""); }));
  var saleMarker = "|" + String(saleId || invoice.id || invoice.sessionId) + "|";
  if (processedChunks.some(function (part) { return part.indexOf(saleMarker) >= 0; })) return;
  row[1] = asNumber_(row[1]) + 1;
  row[2] = asNumber_(row[2]) + asNumber_(invoice.totals.total);
  (invoice.payments || []).forEach(function (payment) {
    if (payment.method === "cash") row[3] = asNumber_(row[3]) + asNumber_(payment.amount);
    if (payment.method === "transfer") row[4] = asNumber_(row[4]) + asNumber_(payment.amount);
    if (payment.method === "breb") row[5] = asNumber_(row[5]) + asNumber_(payment.amount);
    if (payment.method === "card") row[13] = asNumber_(row[13]) + asNumber_(payment.amount);
  });
  row[6] = asNumber_(row[6]) + asNumber_(invoice.totals.discount);
  row[7] = asNumber_(row[7]) + asNumber_(invoice.totals.tax);
  row[8] = asNumber_(row[8]) + asNumber_(invoice.totals.serviceFee);
  row[9] = asNumber_(row[9]) + totalCost;
  row[10] = asNumber_(row[10]) + asNumber_(invoice.totals.total) - totalCost;
  row[11] = new Date().toISOString();
  // Sheets limits a single cell to 50,000 characters. Spill the operation
  // markers into appended columns instead of blocking an entire busy day.
  var markerIndex = processedChunks.length - 1;
  if (processedChunks[markerIndex].length + saleMarker.length > 28000) { processedChunks.push(""); markerIndex += 1; }
  processedChunks[markerIndex] += saleMarker;
  row[12] = processedChunks[0];
  processedChunks.slice(1).forEach(function (part, index) { row[14 + index] = part; });
  if (sheet.getMaxColumns() < row.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), row.length - sheet.getMaxColumns());
  if (targetIndex >= 0) sheet.getRange(targetIndex + 2, 1, 1, row.length).setValues([row]);
  else appendRows_(sheet, [row]);
}

function invoiceCostFromInventory_(invoice) {
  var table = readInventoryTable_();
  return (invoice.items || []).reduce(function (sum, line) {
    var index = findInventoryIndex_(table.rows, line.menu_item_id);
    var cost = index >= 0 ? asNumber_(table.rows[index][5]) : 0;
    return sum + cost * Math.max(0, asNumber_(line.quantity));
  }, 0);
}

function saleExists_(sheet, saleId, sessionId) {
  var cacheKey = "sale_" + hash_(saleId + "|" + sessionId);
  if (CacheService.getScriptCache().get(cacheKey)) return true;
  if (sheet.getLastRow() <= 1) return false;
  var match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3)
    .createTextFinder(saleId)
    .matchEntireCell(true)
    .findNext();
  if (match) return true;
  if (!sessionId) return false;
  return Boolean(sheet.getRange(2, 3, sheet.getLastRow() - 1, 1)
    .createTextFinder(sessionId)
    .matchEntireCell(true)
    .findNext());
}

function hasValueInColumn_(sheet, value, column) {
  if (!value || sheet.getLastRow() <= 1) return false;
  return Boolean(sheet.getRange(2, column, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(value))
    .matchEntireCell(true)
    .findNext());
}

function appendRows_(sheet, rows) {
  if (!rows || !rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function appendAudit_(eventName, reference, user, status, detail) {
  var spreadsheet = getSpreadsheet_();
  appendRows_(spreadsheet.getSheetByName(APP.sheets.audit), [[
    new Date().toISOString(), safeText_(eventName), safeText_(reference), safeText_(user), safeText_(status), safeText_(detail)
  ]]);
}

function validateOrigin_(origin) {
  var allowed = getConfig_().allowedOrigins;
  if (!allowed.length) throw new Error("No hay origenes permitidos configurados.");
  if (allowed.indexOf(String(origin || "")) < 0) throw new Error("Origen no permitido.");
}

function validateSupabaseUser_(authToken) {
  var token = String(authToken || "").trim();
  if (!token) throw new Error("Sesion administrativa requerida.");
  var cache = CacheService.getScriptCache();
  var cacheKey = "user_" + hash_(token);
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  var config = getConfig_();
  if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error("Complete la configuracion de Supabase en la hoja Configuracion.");
  var user = validateSupabaseUserWithConfig_(token, config);
  cache.put(cacheKey, JSON.stringify(user), 120);
  return user;
}

function validateSupabaseUserWithConfig_(authToken, config) {
  var token = String(authToken || "").trim();
  if (!token) throw new Error("Sesion administrativa requerida.");
  var response = UrlFetchApp.fetch(config.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/get_current_user", {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: "Bearer " + config.supabaseAnonKey,
      "x-app-token": token
    },
    payload: JSON.stringify({ auth_token: token }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error("No fue posible validar la sesion con Supabase.");
  var user = JSON.parse(response.getContentText() || "null");
  if (!user || !user.id || user.is_active === false) throw new Error("Usuario no autorizado.");
  return user;
}

function requireAdmin_(user) {
  requireManager_(user);
}

function requireManager_(user) {
  if (!user || ["boss", "admin"].indexOf(String(user.role || "")) < 0) throw new Error("Esta operacion requiere un Jefe o Administrador.");
}

function requireBoss_(user) {
  if (!user || user.role !== "boss") throw new Error("Esta operacion es exclusiva del Jefe.");
}

function requireSection_(user, section) {
  requireManager_(user);
  if (user.role === "boss") return;
  if (!Array.isArray(user.permissions)) return;
  if (user.permissions.indexOf(section) < 0) throw new Error("No tienes acceso a esta seccion.");
}

function getConfig_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get("dp_config");
  if (cached) return JSON.parse(cached);
  var properties = PropertiesService.getScriptProperties();
  var config = {
    supabaseUrl: properties.getProperty(APP.properties.supabaseUrl) || "",
    supabaseAnonKey: properties.getProperty(APP.properties.supabaseAnonKey) || "",
    allowedOrigins: String(properties.getProperty(APP.properties.allowedOrigins) || "").split(",").map(function (origin) { return origin.trim(); }).filter(Boolean),
    timezone: properties.getProperty(APP.properties.timezone) || "America/Bogota"
  };
  cache.put("dp_config", JSON.stringify(config), 300);
  return config;
}

function isConfigured_() {
  var config = getConfig_();
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.allowedOrigins.length);
}

function getTimezone_() {
  return getConfig_().timezone || "America/Bogota";
}

var salesScriptLockHeld_ = false;
function withScriptLock_(callback) {
  if (salesScriptLockHeld_) return callback();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    var error = new Error("Sincronización ocupada; reintento automático."); error.code = "SYNC_BUSY"; error.retryable = true; throw error;
  }
  salesScriptLockHeld_ = true;
  try { recoverPendingSaleJournal_(); return callback(); }
  finally { salesScriptLockHeld_ = false; lock.releaseLock(); }
}

function findInventoryIndex_(rows, productId) {
  var id = String(productId || "");
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0] || "") === id) return index;
  }
  return -1;
}

function safeText_(value) {
  var text = String(value == null ? "" : value).trim();
  if (/^[=+\-@]/.test(text)) return "'" + text;
  return text.slice(0, 500);
}

function asNumber_(value) {
  var number = Number(value || 0);
  return isFinite(number) ? number : 0;
}

function acronym_(name) {
  return String(name || "").trim().split(/\s+/).filter(Boolean).map(function (word) { return word.charAt(0); }).join("").toUpperCase().slice(0, 12);
}

function hash_(value) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""));
  return digest.slice(0, 12).map(function (byte) { return (byte + 256).toString(16).slice(-2); }).join("");
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/** DON PIEROS PIZZA · extensión incorporada al final de Code.gs.
 * No pegar este archivo aparte si se usa Code.gs: ya está incluido allí.
 * Las órdenes y el catálogo viven exclusivamente en el archivo APP.spreadsheetId.
 */
var DP_TABLES = {
  products: { name: 'Menu_Web', headers: ['id','name','category','price','image_url','image_path','description','badge','featured','available','sort_order','modifiers','version'] },
  toppings: { name: 'Adicionales_Web', headers: ['id','name','kind','price','available','sort_order','version'] },
  payments: { name: 'Pagos_Web', headers: ['id','name','account_value','instructions','available','sort_order','version'] },
  neighborhoods: { name: 'Barrios_Web', headers: ['id','name','delivery_fee','available','sort_order','version'] },
  orders: { name: 'Ordenes_Web', headers: ['id','request_id','sequence','createdAt','updatedAt','status','customerName','phone','fulfillment','address','neighborhood','deliveryFee','subtotal','total','paymentMethod','paymentValue','notes','itemsJson','queuePosition','ordersAhead','handledByName','version','deliveryFeePending','packagingFee'] }
};
var DP_STATUSES = ['nueva','atendiendo','lista','despachada','cancelada'];

function dpSeedProperties_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(APP.properties.supabaseUrl)) props.setProperty(APP.properties.supabaseUrl, 'https://bxyvxbutjlvoconfsjub.supabase.co');
  if (!props.getProperty(APP.properties.supabaseAnonKey)) {
    var values = getSpreadsheet_().getSheetByName(APP.sheets.config).getDataRange().getValues();
    values.forEach(function (row) { if (row[0] === 'SUPABASE_ANON_KEY') props.setProperty(APP.properties.supabaseAnonKey, String(row[1] || '')); });
  }
  if (!props.getProperty(APP.properties.allowedOrigins)) props.setProperty(APP.properties.allowedOrigins, 'null,http://localhost:5500');
  CacheService.getScriptCache().remove('dp_config');
}

function dpEnsureSheets_(spreadsheet) {
  Object.keys(DP_TABLES).forEach(function (key) {
    var definition = DP_TABLES[key];
    var sheet = ensureSheet_(spreadsheet, definition.name, definition.headers);
      if(key==='orders'){
        sheet.getRange(1,definition.headers.indexOf('deliveryFeePending')+1).setValue('deliveryFeePending');
        sheet.getRange(1,definition.headers.indexOf('packagingFee')+1).setValue('packagingFee');
      }
  });
  // Add missing payment methods without replacing configured account details
  // or reactivating methods the business has disabled.
  var payments = spreadsheet.getSheetByName(DP_TABLES.payments.name),existing=dpRows_('payments');
  var paymentKey=function(value){return normalizeSearch_(value).replace(/[^a-z0-9]/g,'');};
  [
    ['efectivo','Efectivo','','Paga al recibir tu pedido',true,0,1],
    ['nequi','Transferencia Nequi','','Coordina los datos de pago con Don Pieros Pizza por WhatsApp.',true,1,1],
    ['breb','Bre-B','','Coordina la llave Bre-B con Don Pieros Pizza por WhatsApp.',true,2,1]
  ].forEach(function(row){
    var key=row[0];
    if(!existing.some(function(item){var name=paymentKey(item.name);return paymentKey(item.id)===key||name===key||(key==='nequi'&&name.indexOf('nequi')>=0);}))payments.appendRow(row);
  });
  dpSeedInitialMenu_(spreadsheet);
}

function dpDispatch_(request) {
  var action = request.action, payload = request.payload || request;
  if (action === 'dp_get_catalog') return dpCatalog_(false);
  if (action === 'createOrder') return dpCreateOrder_(request.order || payload.order);
  var user = validateSupabaseUser_(request.authToken);
  if (['dp_get_orders','dp_get_order','dp_order_status','dp_update_order','dp_delete_order'].indexOf(action)>=0) {
    dpRequireOrders_(user);
    if (action === 'dp_order_status') return {ok:true,revision:PropertiesService.getScriptProperties().getProperty('DP_ORDERS_REVISION') || '0'};
    if (action === 'dp_get_orders') return dpOrders_(payload);
    if (action === 'dp_get_order') return Object.assign(dpGetOrder_(payload),{checkoutAvailable:true});
    if (action === 'dp_delete_order') return dpDeleteOrder_(payload,user);
    return dpUpdateOrder_(payload,user);
  }
  requireSection_(user,'inventory');
  if (action === 'dp_admin_catalog') return dpCatalog_(true);
  if (action === 'dp_save_catalog') return dpSaveCatalog_(payload,user);
  if (action === 'dp_delete_catalog') return dpDeleteCatalog_(payload,user);
  throw new Error('Acción no permitida.');
}

function dpRequireOrders_(user) {
  if (!user || !user.id) throw new Error('Sesión requerida.');
  if (user.role === 'boss' || user.role === 'waiter') return;
  if (user.role === 'admin' && (!Array.isArray(user.permissions) || user.permissions.indexOf('dashboard') >= 0 || user.permissions.indexOf('service') >= 0)) return;
  throw new Error('No tienes permiso para atender pedidos.');
}

function dpText_(value,max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max || 200);
}
function dpCell_(value) {
  return typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
}
function dpBoolean_(value) { return value === true || /^(true|si|sí|1)$/i.test(String(value)); }
function dpMoney_(value) {
  var number = Number(value);
  if (!isFinite(number) || number < 0 || number > 100000000) throw new Error('Valor monetario inválido.');
  return Math.round(number);
}
function dpRejectOrder_(message){var error=new Error(message);error.retryable=false;error.code='ORDER_VALIDATION';throw error;}
function dpRows_(key) {
  var definition = DP_TABLES[key], sheet = getSpreadsheet_().getSheetByName(definition.name);
  if (sheet.getLastRow() < 2) return [];
  return dpObjects_(key,sheet.getRange(2,1,sheet.getLastRow()-1,definition.headers.length).getValues());
}
function dpObjects_(key,rows) {
  var definition=DP_TABLES[key];
  return rows.filter(function(row){return row[0];}).map(function(row){
    var result = {};
    definition.headers.forEach(function(header,i){result[header]=row[i] instanceof Date ? row[i].toISOString() : row[i];});
    ['price','delivery_fee','sort_order','version','sequence','total','subtotal','deliveryFee','queuePosition','ordersAhead','packagingFee'].forEach(function(field){if(Object.prototype.hasOwnProperty.call(result,field))result[field]=Number(result[field]) || 0;});
    ['available','featured','deliveryFeePending'].forEach(function(field){if(Object.prototype.hasOwnProperty.call(result,field))result[field]=dpBoolean_(result[field]);});
    if(key==='products') { try {result.modifiers=JSON.parse(result.modifiers || '[]');} catch(_){result.modifiers=[];} }
    if(key==='orders') { try {result.items=JSON.parse(result.itemsJson || '[]');} catch(_){result.items=[];} delete result.itemsJson; }
    return result;
  });
}

function dpWithLock_(callback) {
  var lock=LockService.getScriptLock();lock.waitLock(10000);
  try{return callback();}finally{lock.releaseLock();}
}

function dpCatalog_(admin) {
  var cache = CacheService.getScriptCache(), cached = !admin && cache.get('DP_CATALOG');
  if(cached) return JSON.parse(cached);
  var result={ok:true,revision:PropertiesService.getScriptProperties().getProperty('DP_CATALOG_REVISION') || '0'};
  ['products','toppings','payments','neighborhoods'].forEach(function(key){
    result[key]=dpRows_(key).filter(function(row){return admin || key==='products' || row.available;}).sort(function(a,b){return a.sort_order-b.sort_order || String(a.name).localeCompare(String(b.name));});
  });
  if(!admin) {try {cache.put('DP_CATALOG',JSON.stringify(result),30);}catch(_){} }
  return result;
}

function dpInvalidateCatalog_() {
  CacheService.getScriptCache().remove('DP_CATALOG');
  PropertiesService.getScriptProperties().setProperty('DP_CATALOG_REVISION',Utilities.getUuid());
}

function dpSaveCatalog_(payload,user) {
  var key=payload.kind, definition=DP_TABLES[key];
  if(['products','toppings','payments','neighborhoods'].indexOf(key)<0)throw new Error('Catálogo inválido.');
  return dpWithLock_(function(){
    var sheet=getSpreadsheet_().getSheetByName(definition.name),values=sheet.getDataRange().getValues();
    var item=payload.item || {}, rows=dpObjects_(key,values.slice(1)), old=rows.filter(function(row){return row.id===item.id;})[0];
    if(!old&&Number(item.version)>0)throw new Error('Este registro fue eliminado. Actualiza el menú.');
    if(old && Number(item.version)!==old.version)throw new Error('Otra persona editó este registro. Actualiza antes de guardar.');
    var saved={id:old ? old.id : /^[a-f0-9-]{36}$/i.test(String(item.id||'')) ? item.id : Utilities.getUuid(),name:dpText_(item.name,120),available:item.available!==false,sort_order:Number(item.sort_order)||0,version:(old ? old.version : 0)+1};
    if(!saved.name)throw new Error('Escribe un nombre.');
    if(key==='products') {
      saved.category=dpText_(item.category,80) || 'Menú'; saved.price=dpMoney_(item.price); saved.description=dpText_(item.description,1000);saved.badge=dpText_(item.badge,40);saved.featured=!!item.featured;
      saved.image_url=dpText_(item.image_url,1200);saved.image_path=dpText_(item.image_path,300);
      var allowed='https://bxyvxbutjlvoconfsjub.supabase.co/storage/v1/object/public/product-images/';
      if(saved.image_url && saved.image_url.indexOf(allowed)!==0)throw new Error('La imagen debe subirse al almacenamiento de este negocio.');
      var modifiers=Array.isArray(item.modifiers) ? item.modifiers : [];
      if(modifiers.length>12)throw new Error('Máximo 12 grupos de adicionales.');
      saved.modifiers=modifiers.map(function(group,index){
        var min=Math.max(0,Math.min(30,Math.floor(Number(group.min)||0))),max=Math.max(1,Math.min(30,Math.floor(Number(group.max)||1)));
        if(min>max)throw new Error('El mínimo de opciones supera el máximo.');
        return {id:dpText_(group.id,50)||'grupo-'+index,name:dpText_(group.name,100)||'Adicionales',source:dpText_(group.source,60)||'Adicional',required:!!group.required,min:min,max:max,usePrice:!!group.usePrice};
      });
    }
    if(key==='toppings'){saved.kind=dpText_(item.kind,60)||'Adicional';saved.price=dpMoney_(item.price);}
    if(key==='payments'){saved.account_value=dpText_(item.account_value,160);saved.instructions=dpText_(item.instructions,500);}
    if(key==='neighborhoods')saved.delivery_fee=dpMoney_(item.delivery_fee);
    var rowIndex=-1;
    for(var i=1;i<values.length;i++)if(String(values[i][0])===saved.id){rowIndex=i+1;break;}
    var cells=definition.headers.map(function(header){var value=saved[header];return dpCell_(header==='modifiers'?JSON.stringify(value):value==null?'':value);});
    sheet.getRange(rowIndex>0?rowIndex:sheet.getLastRow()+1,1,1,cells.length).setValues([cells]);
    dpInvalidateCatalog_();appendAudit_('WEB_MENU_SAVE',saved.id,user.full_name,'OK',key+': '+saved.name);
    return {ok:true,item:saved};
  });
}

function dpDeleteCatalog_(payload,user) {
  if(['products','toppings','payments','neighborhoods'].indexOf(payload.kind)<0)throw new Error('Catálogo inválido.');
  return dpWithLock_(function(){
    var sheet=getSpreadsheet_().getSheetByName(DP_TABLES[payload.kind].name),values=sheet.getDataRange().getValues();
    for(var i=1;i<values.length;i++)if(String(values[i][0])===payload.id){
      var versionIndex=DP_TABLES[payload.kind].headers.indexOf('version');
      if(Number(values[i][versionIndex])!==Number(payload.version))throw new Error('El registro cambió. Actualiza antes de eliminar.');
      sheet.deleteRow(i+1);dpInvalidateCatalog_();appendAudit_('WEB_MENU_DELETE',payload.id,user.full_name,'OK',payload.kind);return {ok:true};
    }
    return {ok:true,alreadyDeleted:true};
  });
}

function dpBox_(product,labels) {
  var text=normalizeSearch_((labels||[]).length?labels.join(' '):product.name),name=normalizeSearch_(product.name+' '+product.category),size='';
  if(!/pizza|pizzeta/.test(name))return {size:'',fee:0};
  if(/pizzeta/.test(name))size='Pizzeta';
  else if(/super\s*maxi/.test(text))size='Super maxi';
  else if(/\bmaxi\b/.test(text))size='Maxi';
  else if(/\bmediana\b/.test(text))size='Mediana';
  else if(/\bmini\b/.test(text))size='Mini';
  return {size:size,fee:size==='Maxi'||size==='Super maxi'?4000:size?2000:0};
}
function dpPriceOrder_(raw,catalog) {
  if(!raw || !Array.isArray(raw.items) || !raw.items.length || raw.items.length>60)throw new Error('La orden debe contener entre 1 y 60 productos.');
  var fulfillment=raw.fulfillment==='delivery'?'delivery':raw.fulfillment==='dinein'?'dinein':'pickup';
  var items=raw.items.map(function(line){
    var product=catalog.products.filter(function(p){return p.id===line.productId;})[0];
    if(!product || !product.available)throw new Error('Un producto ya no está disponible. Actualiza la carta.');
    var quantity=Number(line.quantity);
    if(!Number.isInteger(quantity) || quantity<1 || quantity>99)throw new Error('Cantidad inválida.');
    var unitPrice=dpMoney_(product.price),labels=[],sizeLabels=[],selectionIds=line.selectionIds||{},groupIds=[];
    (product.modifiers||[]).forEach(function(group){
      groupIds.push(group.id);
      var ids=selectionIds[group.id] || [];
      if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new Error('Opciones inválidas.');
      var min=group.required?Math.max(1,Number(group.min)||1):0,max=Number(group.max)||99;
      if(ids.length<min || ids.length>max)throw new Error('Revisa las opciones de '+product.name+'.');
      ids.forEach(function(id){
        var option=catalog.toppings.filter(function(t){return t.id===id && t.available && t.kind===group.source;})[0];
        if(!option)throw new Error('Un adicional ya no está disponible.');
        if(/tamano pizza/.test(normalizeSearch_(group.source)))sizeLabels.push(option.name);
        var price=group.usePrice ? dpMoney_(option.price) : 0;unitPrice+=price;labels.push(group.name+': '+option.name+(price?' (+$'+price+')':''));
      });
    });
    Object.keys(selectionIds).forEach(function(id){if(groupIds.indexOf(id)<0 && selectionIds[id].length)throw new Error('Las opciones del producto cambiaron. Actualiza la carta.');});
    if(Number(line.unitPrice)!==unitPrice)throw new Error('El precio de '+product.name+' cambió. Actualiza la carta antes de confirmar.');
    var box=dpBox_(product,sizeLabels);
    return {productId:product.id,name:product.name,quantity:quantity,unitPrice:unitPrice,selections:labels,packagingSize:box.size,packagingUnitFee:fulfillment==='dinein'?0:box.fee};
  });
  var neighborhood=null,deliveryFee=0,deliveryFeePending=false,neighborhoodName='';
  if(fulfillment==='delivery') {
    neighborhoodName=dpText_(raw.neighborhood,80);
    var neighborhoodId=dpText_(raw.neighborhoodId,80);
    neighborhood=catalog.neighborhoods.filter(function(n){return neighborhoodId?n.id===neighborhoodId:normalizeSearch_(n.name)===normalizeSearch_(neighborhoodName);})[0];
    if((neighborhoodId&&!neighborhood)||(neighborhood&&!neighborhood.available))throw new Error('Ese barrio ya no está disponible. Revisa la dirección de entrega.');
    if(dpText_(raw.address,300).length<5||(!neighborhood&&neighborhoodName.length<2))throw new Error('Escribe un barrio y una dirección válida.');
    if(neighborhood){neighborhoodName=neighborhood.name;deliveryFee=dpMoney_(neighborhood.delivery_fee);}
    else deliveryFeePending=true;
    if(Number(raw.deliveryFee)!==deliveryFee)throw new Error('La tarifa del domicilio cambió. Actualiza la carta.');
  }
  var payment=catalog.payments.filter(function(p){return p.id===raw.paymentId && p.available;})[0];
  if(!payment)throw new Error('Selecciona un medio de pago disponible.');
  var subtotal=items.reduce(function(sum,line){return sum+line.unitPrice*line.quantity;},0);
  var packagingFee=items.reduce(function(sum,line){return sum+line.quantity*line.packagingUnitFee;},0);
  return {items:items,fulfillment:fulfillment,neighborhood:neighborhoodName,deliveryFee:deliveryFee,deliveryFeePending:deliveryFeePending,subtotal:subtotal,packagingFee:packagingFee,total:subtotal+packagingFee+deliveryFee,payment:payment};
}

function dpOrderResult_(order,duplicate) {
  return {ok:true,orderId:order.id,sequence:order.sequence,total:order.total,subtotal:order.subtotal,packagingFee:Number(order.packagingFee)||0,deliveryFee:order.deliveryFee,deliveryFeePending:!!order.deliveryFeePending,neighborhood:order.neighborhood,queuePosition:order.queuePosition,ordersAhead:order.ordersAhead,duplicate:!!duplicate};
}

function dpCreateOrder_(raw) {
  if(!raw || !/^[a-f0-9-]{36}$/i.test(String(raw.requestId||'')))dpRejectOrder_('Identificador de pedido inválido.');
  var customerName=dpText_(raw.customerName,80),phone=dpText_(raw.phone,25);
  if(customerName.length<2)dpRejectOrder_('Escribe un nombre de al menos dos caracteres.');
  if(!/^[\d\s]{10,25}$/.test(phone)||phone.replace(/\D/g,'').length!==10)dpRejectOrder_('El teléfono debe tener exactamente 10 dígitos. Puedes separarlos con espacios.');
  phone=phone.replace(/\s/g,'');
  var result=dpWithLock_(function(){
    var sheet=getSpreadsheet_().getSheetByName(DP_TABLES.orders.name),last=sheet.getLastRow();
    // Read metadata only. Historical item JSON is not downloaded to assign a turn.
    var metadata=last>1?sheet.getRange(2,1,last-1,6).getValues():[],duplicateIndex=-1;
    metadata.some(function(row,index){if(row[1]===raw.requestId){duplicateIndex=index+2;return true;}return false;});
    if(duplicateIndex>0){
      var duplicate=dpObjects_('orders',sheet.getRange(duplicateIndex,1,1,DP_TABLES.orders.headers.length).getValues())[0];
      if(duplicate.status==='eliminada')dpRejectOrder_('Este pedido fue retirado por el negocio. Crea un nuevo pedido si deseas volver a ordenar.');
      return dpOrderResult_(duplicate,true);
    }
    // Authoritative prices and availability, including direct edits to Sheets.
    var priced;
    try{priced=dpPriceOrder_(raw,dpCatalog_(true));}catch(error){error.retryable=false;error.code='ORDER_VALIDATION';throw error;}
    var now=new Date().toISOString(),properties=PropertiesService.getScriptProperties();
    var sequence=Math.max(Number(properties.getProperty('DP_NEXT_ORDER')||1),metadata.reduce(function(max,row){return Math.max(max,(Number(row[2])||0)+1);},1));
    var active=metadata.filter(function(row){return ['nueva','atendiendo','lista'].indexOf(String(row[5]))>=0;});
    var id='DP-'+Utilities.formatDate(new Date(),'America/Bogota','yyyyMMdd')+'-'+String(sequence).padStart(4,'0');
    var order={id:id,request_id:raw.requestId,sequence:sequence,createdAt:now,updatedAt:now,status:'nueva',customerName:customerName,phone:phone,fulfillment:priced.fulfillment,address:priced.fulfillment==='delivery'?dpText_(raw.address,300):'',neighborhood:priced.neighborhood,deliveryFee:priced.deliveryFee,subtotal:priced.subtotal,total:priced.total,paymentMethod:priced.payment.name,paymentValue:priced.payment.account_value,notes:dpText_(raw.notes,1000),itemsJson:JSON.stringify(priced.items),queuePosition:active.length+1,ordersAhead:active.length,handledByName:'',version:1};
    order.deliveryFeePending=priced.deliveryFeePending;order.packagingFee=priced.packagingFee;
    try {
      sheet.getRange(sheet.getLastRow()+1,1,1,DP_TABLES.orders.headers.length).setValues([DP_TABLES.orders.headers.map(function(header){return dpCell_(order[header]);})]);
      SpreadsheetApp.flush();
      try{CacheService.getScriptCache().put('DP_ORDER_ROW:'+id,String(last+1),21600);}catch(_){}
    } finally { properties.setProperty('DP_ORDERS_REVISION',Utilities.getUuid()); }
    properties.setProperty('DP_NEXT_ORDER',String(sequence+1));
    // Wake reception before the customer receives the receipt. No customer data
    // travels on the public channel; details still require an authorized user.
    try{appendAudit_('WEB_ORDER',id,customerName,'OK','Orden guardada; turno '+order.queuePosition);}catch(_){}
    return dpOrderResult_(order,false);
  });
  dpSignalOrder_('order-created',result.orderId);
  return result;
}

function dpOrders_(payload) {
  var revision=PropertiesService.getScriptProperties().getProperty('DP_ORDERS_REVISION')||'0';
  if(payload.revision && payload.revision===revision)return {ok:true,changed:false,revision:revision};
  var sheet=getSpreadsheet_().getSheetByName(DP_TABLES.orders.name),last=sheet.getLastRow(),limit=Math.min(100,Math.max(20,Number(payload.limit)||60));
  var metadata=last>1?sheet.getRange(2,3,last-1,4).getValues():[];
  var orders=metadata.map(function(row,index){return{row:index+2,sequence:Number(row[0])||0,status:String(row[3])};}).sort(function(a,b){return b.sequence-a.sequence;});
  var filter=payload.status||'active';
  var filtered=orders.filter(function(order){return ['eliminada','cobrada'].indexOf(order.status)<0 && (filter==='all' || (filter==='active'?['nueva','atendiendo','lista'].indexOf(order.status)>=0:order.status===filter));});
  var offset=Math.max(0,Number(payload.offset)||0);
  var selected=filtered.slice(offset,offset+limit).sort(function(a,b){return a.row-b.row;}),cells=[];
  for(var i=0;i<selected.length;){var start=selected[i].row,end=start;i++;while(i<selected.length && selected[i].row===end+1){end=selected[i].row;i++;}cells=cells.concat(sheet.getRange(start,1,end-start+1,DP_TABLES.orders.headers.length).getValues());}
  var result=dpObjects_('orders',cells).sort(function(a,b){return b.sequence-a.sequence;});
  return {ok:true,changed:true,revision:revision,total:filtered.length,orders:result,activeCount:orders.filter(function(o){return ['nueva','atendiendo','lista'].indexOf(o.status)>=0;}).length};
}

function dpUpdateOrder_(payload,user) {
  var result=dpWithLock_(function(){
    recoverPendingSaleJournal_();
    var sheet=getSpreadsheet_().getSheetByName(DP_TABLES.orders.name),headers=DP_TABLES.orders.headers,last=sheet.getLastRow();
    if(DP_STATUSES.indexOf(payload.status)<0)throw new Error('Estado inválido.');
    var ids=last>1?sheet.getRange(2,1,last-1,1).getValues():[];
    for(var i=0;i<ids.length;i++)if(ids[i][0]===payload.id){
      var row=sheet.getRange(i+2,1,1,headers.length).getValues()[0];
      if(row[headers.indexOf('status')]==='eliminada')throw new Error('Este pedido fue eliminado.');
      if(row[headers.indexOf('status')]===payload.status)return {ok:true,duplicate:true};
      if(Number(row[headers.indexOf('version')])!==Number(payload.version))throw new Error('Otra persona atendió esta orden. Actualiza para ver su estado.');
      row[headers.indexOf('status')]=payload.status;row[headers.indexOf('updatedAt')]=new Date().toISOString();row[headers.indexOf('handledByName')]=dpCell_(user.full_name||user.username);row[headers.indexOf('version')]=Number(payload.version)+1;
      try{sheet.getRange(i+2,1,1,headers.length).setValues([row]);SpreadsheetApp.flush();}finally{PropertiesService.getScriptProperties().setProperty('DP_ORDERS_REVISION',Utilities.getUuid());}
      appendAudit_('WEB_ORDER_STATUS',payload.id,user.full_name,'OK',payload.status);return {ok:true,order:dpObjects_('orders',[row])[0]};
    }
    throw new Error('No se encontró el pedido.');
  });
  dpSignalOrder_('order-updated',payload.id);
  return result;
}

function dpGetOrder_(payload) {
  var id=dpText_(payload.id,100);
  if(!/^DP-[a-zA-Z0-9-]{1,80}$/.test(id))throw new Error('Pedido inválido.');
  var sheet=getSpreadsheet_().getSheetByName(DP_TABLES.orders.name),last=sheet.getLastRow();
  var cache=CacheService.getScriptCache(),rowIndex=Number(cache.get('DP_ORDER_ROW:'+id));
  if(rowIndex>=2&&rowIndex<=last){
    var cachedRow=sheet.getRange(rowIndex,1,1,DP_TABLES.orders.headers.length).getValues();
    if(cachedRow[0][0]===id){var cachedOrder=dpObjects_('orders',cachedRow)[0];return {ok:true,order:cachedOrder.status==='eliminada'?null:cachedOrder};}
  }
  var ids=last>1?sheet.getRange(2,1,last-1,1).getValues():[];
  for(var i=ids.length-1;i>=0;i--)if(ids[i][0]===id){
    try{cache.put('DP_ORDER_ROW:'+id,String(i+2),21600);}catch(_){}
    var order=dpObjects_('orders',sheet.getRange(i+2,1,1,DP_TABLES.orders.headers.length).getValues())[0];
    return {ok:true,order:order.status==='eliminada'?null:order};
  }
  return {ok:true,order:null};
}

function dpDeleteOrder_(payload,user) {
  var result=dpWithLock_(function(){
    recoverPendingSaleJournal_();
    var sheet=getSpreadsheet_().getSheetByName(DP_TABLES.orders.name),headers=DP_TABLES.orders.headers,last=sheet.getLastRow();
    var ids=last>1?sheet.getRange(2,1,last-1,1).getValues():[];
    for(var i=ids.length-1;i>=0;i--)if(ids[i][0]===payload.id){
      var row=sheet.getRange(i+2,1,1,headers.length).getValues()[0];
      if(row[5]==='eliminada')return {ok:true,alreadyDeleted:true};
      if(Number(row[headers.indexOf('version')])!==Number(payload.version))throw new Error('El pedido cambió. Revisa su estado antes de eliminar.');
      // Keep the request id so a delayed customer retry cannot recreate it.
      row[5]='eliminada';row[4]=new Date().toISOString();row[20]=dpCell_(user.full_name||user.username);row[21]=Number(payload.version)+1;
      try{sheet.getRange(i+2,1,1,headers.length).setValues([row]);SpreadsheetApp.flush();}finally{PropertiesService.getScriptProperties().setProperty('DP_ORDERS_REVISION',Utilities.getUuid());}
      try{appendAudit_('WEB_ORDER_DELETE',payload.id,user.full_name,'OK','Retirado de recepción');}catch(_){}
      return {ok:true};
    }
    return {ok:true,alreadyDeleted:true};
  });
  dpSignalOrder_('order-updated',payload.id);
  return result;
}

function dpSignalOrder_(event,id) {
  try{
    var config=getConfig_();if(!config.supabaseUrl||!config.supabaseAnonKey)return;
    UrlFetchApp.fetch(config.supabaseUrl.replace(/\/$/,'')+'/realtime/v1/api/broadcast',{
      method:'post',contentType:'application/json',headers:{apikey:config.supabaseAnonKey,Authorization:'Bearer '+config.supabaseAnonKey},
      payload:JSON.stringify({messages:[{topic:'don-pieros-orders-live',event:event,payload:{orderId:id}}]}),muteHttpExceptions:true
    });
  }catch(_){} // Polling and the customer's independent signal remain available.
}

// For a script bound to this spreadsheet, direct edits refresh caches automatically.
function onEdit(e) {
  if(!e || !e.range)return;
  var name=e.range.getSheet().getName();
  if(['Menu_Web','Adicionales_Web','Pagos_Web','Barrios_Web'].indexOf(name)>=0)dpInvalidateCatalog_();
  if(name==='Ordenes_Web')PropertiesService.getScriptProperties().setProperty('DP_ORDERS_REVISION',Utilities.getUuid());
}

/** Optional installable trigger for a standalone Apps Script project. */
function ACTIVAR_EDICIONES_DIRECTAS() {
  CONFIGURAR_SISTEMA();
  var exists=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='onEdit';});
  if(!exists)ScriptApp.newTrigger('onEdit').forSpreadsheet(APP.spreadsheetId).onEdit().create();
  return {ok:true};
}

// BEGIN DON PIEROS INITIAL MENU
var DP_INITIAL_MENU = {
  "source": "Carta proporcionada por el negocio",
  "products": [
    {
      "id": "cb53e3f4-d07b-524e-af1a-d829cf96dd36",
      "name": "Pizza La Pamplonita",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Champiñón, pollo, atún, cebolla, maicitos y piña.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 0,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "41a68eac-7327-54d1-a1ae-70efbe9ee837",
      "name": "Pizza Don Pieros",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Salami, cábano, jamón, tocineta, camarón, pollo, champiñón, pimentón y cebolla.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 1,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "6ea61e81-ef78-586a-a339-a320bed708f1",
      "name": "Pizza Carnes",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Salami, cábano, jamón, pollo, tocineta y chorizo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 2,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "5b139712-bb6f-520f-a4ab-91ca858376a8",
      "name": "Pizza Frutas",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Manzana, durazno, ciruela, brevas y piña.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 3,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "cc1f89f5-72e6-5eaf-a501-91cf3962fdfb",
      "name": "Pizza Campesina",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Pollo, champiñón, maicitos, tomate, cebolla y pimentón.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 4,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "1671b6d7-54f9-55ee-a551-efb6c9d0c434",
      "name": "Pizza Vegetales",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Champiñón, pimentón, tomate, cebolla, alcaparra, aceitunas, orégano y sal de ajo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 5,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "9272d0b1-af77-569f-a5f9-58cbe7dac7e0",
      "name": "Pizza Mexicana",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Salami, cábano, carne molida, pimentón, cebolla, jalapeño, orégano y sal de ajo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 6,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "fa9f2c2f-6b6a-5d68-a55b-ee1d1ff97493",
      "name": "Pizza Caprichosa",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Tocineta, bocadillo y maicitos.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 7,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "4ef1fb4a-cb8b-59c2-aebd-356fe8351a46",
      "name": "Pizza Pollo-champiñón",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Pollo y champiñón.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 8,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "164ad633-5498-5705-a912-dfa093e65093",
      "name": "Pizza Loca",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Salami, cábano, jamón, piña, durazno y ciruela.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 9,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "f2589307-8f6a-5c56-a5c1-61e05a3e2668",
      "name": "Pizza El Cacique",
      "category": "Pizzas especiales",
      "price": 46000,
      "image_url": "",
      "image_path": "",
      "description": "Cábano, cebolla, pimentón, piña, atún, pollo y tomate.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 10,
      "modifiers": [
        {
          "id": "a59b5d14-e985-54fa-a5a8-187b988762df",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza especial",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        }
      ],
      "version": 1
    },
    {
      "id": "f8a4dfd0-9bad-54af-a438-4986eaebae5f",
      "name": "Pizza Ciruelas y tocineta",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Ciruelas y tocineta. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 11,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "921e5e2a-df9e-57e8-abee-b902e693cd73",
      "name": "Pizza Hawaiana",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Hawaiana. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 12,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "a34bd316-c7a4-56a7-a353-8f7a245ccf22",
      "name": "Pizza Jamón con pollo",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Jamón con pollo. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 13,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "438f4545-b9b6-5b18-a75d-3aad987a24b1",
      "name": "Pizza Durazno con peperoni",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Durazno con peperoni. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 14,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "b7567ee8-0a09-5ce0-a28e-488cb0195fce",
      "name": "Pizza Salami con peperoni",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Salami con peperoni. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 15,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "0d4cdd8b-438f-5bf3-afe6-08ae8011a6ce",
      "name": "Pizza Chorizo con maicitos",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Chorizo con maicitos. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 16,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "a3797815-2ffb-5521-a4ad-be6c0052c1e1",
      "name": "Pizza Napolitana",
      "category": "Pizzas sencillas",
      "price": 43000,
      "image_url": "",
      "image_path": "",
      "description": "Primera mitad: Napolitana. Elige el sabor de la segunda mitad; puede ser el mismo.",
      "badge": "4 tamaños",
      "featured": true,
      "available": true,
      "sort_order": 17,
      "modifiers": [
        {
          "id": "a6054775-7408-5472-ab24-36a0611fc912",
          "name": "Elige el tamaño",
          "source": "Tamaño pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": true
        },
        {
          "id": "1646671b-0785-5251-a7cb-0ee66288a4e1",
          "name": "Sabor de la segunda mitad",
          "source": "Sabor pizza sencilla",
          "required": true,
          "min": 1,
          "max": 1,
          "usePrice": false
        }
      ],
      "version": 1
    },
    {
      "id": "27745b48-d01c-5c91-a43d-67d03b62f5cb",
      "name": "Lasaña marinera",
      "category": "Lasañas y panzerotti",
      "price": 21000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 18,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "b740f0d4-db93-55b7-a034-d7acb408f807",
      "name": "Lasaña mixta",
      "category": "Lasañas y panzerotti",
      "price": 20000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 19,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "f3372b34-339f-5e53-a351-49cbbc486126",
      "name": "Lasaña especial",
      "category": "Lasañas y panzerotti",
      "price": 22000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 20,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "14398301-d08d-50aa-a0b3-db0d5af573b8",
      "name": "Boloñesa",
      "category": "Lasañas y panzerotti",
      "price": 20000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 21,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "ebe693ab-0c5c-52d0-a1ed-3232bc9884e6",
      "name": "Panzerotti hawaiano",
      "category": "Lasañas y panzerotti",
      "price": 20000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 22,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "089309e3-e0e5-56c6-a535-f63886a04313",
      "name": "Panzerotti carnes",
      "category": "Lasañas y panzerotti",
      "price": 22000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 23,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "b0e3f475-4e4e-51fa-a99a-371d9a33ed4b",
      "name": "Panzerotti especial",
      "category": "Lasañas y panzerotti",
      "price": 22000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 24,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "52073510-df4f-5604-a9c2-259422e4d169",
      "name": "Porción hawaiana",
      "category": "Porciones",
      "price": 15000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 25,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "93610852-b538-5bd6-ae77-cb44ea788883",
      "name": "Porción mexicana",
      "category": "Porciones",
      "price": 16000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 26,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "dbe117ff-c430-53e0-a810-094c7c156127",
      "name": "Porción especial",
      "category": "Porciones",
      "price": 17000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 27,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "112aa625-512c-5f92-afd3-80afaadd52e5",
      "name": "Porción verduras",
      "category": "Porciones",
      "price": 16000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 28,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "a28447f4-c280-56ed-a7f0-647b9f80631c",
      "name": "Porción campesina",
      "category": "Porciones",
      "price": 16000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 29,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "e8e75e3e-3ccc-5bb1-a573-0c20af1939cd",
      "name": "Porción carnes",
      "category": "Porciones",
      "price": 17000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 30,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "7d434d47-c5fe-556c-aef3-8f6bb36d8627",
      "name": "Porción caprichosa",
      "category": "Porciones",
      "price": 16000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 31,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "885e2b78-bfb9-50aa-a46c-4ad39220f240",
      "name": "Porción loca",
      "category": "Porciones",
      "price": 17000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 32,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "b29106b0-b410-5472-abad-59830ce9aad8",
      "name": "Porción peperoni",
      "category": "Porciones",
      "price": 16000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 33,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "01c8c8f8-5049-5b0b-a313-cebab08799ad",
      "name": "Porción pollo champiñones",
      "category": "Porciones",
      "price": 16000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 34,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "5424ceac-035f-5c0f-ab0b-c310701c1fd4",
      "name": "Pizzeta hawaiana",
      "category": "Pizzetas",
      "price": 28000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 35,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "e50178e4-86ba-555e-ad77-df9d36ad941e",
      "name": "Pizzeta mexicana",
      "category": "Pizzetas",
      "price": 30000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 36,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "cc0b3f8d-6fa0-5a63-aa9c-ebc074f88215",
      "name": "Pizzeta especial",
      "category": "Pizzetas",
      "price": 32000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 37,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "bbeeb222-6c1f-59aa-adf6-930e9d9f5497",
      "name": "Pizzeta verduras",
      "category": "Pizzetas",
      "price": 30000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 38,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "ffb20147-dcf0-5393-a28b-14dc58e469c8",
      "name": "Pizzeta campesina",
      "category": "Pizzetas",
      "price": 30000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 39,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "55d697da-2705-5205-ad3e-cacad2bcf00d",
      "name": "Pizzeta carnes",
      "category": "Pizzetas",
      "price": 32000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 40,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "45ab0250-df06-5428-aa48-44c5c4a41234",
      "name": "Pizzeta caprichosa",
      "category": "Pizzetas",
      "price": 30000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 41,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "b6b3a059-7bc6-5da4-a8cb-af527f26bbc3",
      "name": "Pizzeta loca",
      "category": "Pizzetas",
      "price": 32000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 42,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "2066e459-342a-5e72-ab76-cf166f7a6b7e",
      "name": "Pizzeta peperoni",
      "category": "Pizzetas",
      "price": 30000,
      "image_url": "",
      "image_path": "",
      "description": "Pizzeta de 24 × 24 cm.",
      "badge": "24 × 24 cm",
      "featured": true,
      "available": true,
      "sort_order": 43,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "1f34d231-2b23-54da-aecb-02f2dece7e99",
      "name": "Club Colombia",
      "category": "Bebidas",
      "price": 6000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 44,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "d7dc7ef2-7d4d-5c30-a3b9-0d50085742fc",
      "name": "Cerveza Águila lata",
      "category": "Bebidas",
      "price": 5000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 45,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "b1351856-b743-5712-a2a9-c6dfa744247f",
      "name": "Jugos naturales",
      "category": "Bebidas",
      "price": 8000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 46,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "9c007a06-bf73-5b94-ada6-46329473c618",
      "name": "Limonadas",
      "category": "Bebidas",
      "price": 8000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 47,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "33d4f35c-5875-5369-a180-8787f6155aec",
      "name": "Naranjadas",
      "category": "Bebidas",
      "price": 8000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 48,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "bf3039e6-c3b4-55d7-a5fc-74fd2057113b",
      "name": "Gaseosas",
      "category": "Bebidas",
      "price": 4000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 49,
      "modifiers": [],
      "version": 1
    },
    {
      "id": "4dd74fc0-bffe-52b8-a685-101a131d0754",
      "name": "Gaseosa 1,5 litros",
      "category": "Bebidas",
      "price": 9000,
      "image_url": "",
      "image_path": "",
      "description": "",
      "badge": "",
      "featured": true,
      "available": true,
      "sort_order": 50,
      "modifiers": [],
      "version": 1
    }
  ],
  "toppings": [
    {
      "id": "ff1bca87-a7d8-510b-acb5-640b7dda337b",
      "name": "Mini · 27 × 27 cm",
      "kind": "Tamaño pizza especial",
      "price": 0,
      "available": true,
      "sort_order": 0,
      "version": 1
    },
    {
      "id": "bb012fe0-aee3-50d5-a9d1-d834fd80819c",
      "name": "Mediana · 37 × 37 cm",
      "kind": "Tamaño pizza especial",
      "price": 17000,
      "available": true,
      "sort_order": 1,
      "version": 1
    },
    {
      "id": "ca51cab1-731d-5b54-a8b4-e213de76debf",
      "name": "Maxi · 45 × 45 cm",
      "kind": "Tamaño pizza especial",
      "price": 32000,
      "available": true,
      "sort_order": 2,
      "version": 1
    },
    {
      "id": "fe2d2dbc-cac2-5d66-a249-2d90f9a71261",
      "name": "Super maxi · 54 × 54 cm",
      "kind": "Tamaño pizza especial",
      "price": 50000,
      "available": true,
      "sort_order": 3,
      "version": 1
    },
    {
      "id": "e03bc6e3-5541-5a4b-a12d-5442a190fba0",
      "name": "Mini · 27 × 27 cm",
      "kind": "Tamaño pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 0,
      "version": 1
    },
    {
      "id": "1c8ba5d5-cdb7-598b-a5e7-e7a04535c3bb",
      "name": "Mediana · 37 × 37 cm",
      "kind": "Tamaño pizza sencilla",
      "price": 13000,
      "available": true,
      "sort_order": 1,
      "version": 1
    },
    {
      "id": "7a18dc02-fa38-5b5e-a263-eafd6c4203a3",
      "name": "Maxi · 45 × 45 cm",
      "kind": "Tamaño pizza sencilla",
      "price": 32000,
      "available": true,
      "sort_order": 2,
      "version": 1
    },
    {
      "id": "0dc6c9b7-3478-5ba0-adca-7065cc0dd301",
      "name": "Super maxi · 54 × 54 cm",
      "kind": "Tamaño pizza sencilla",
      "price": 45000,
      "available": true,
      "sort_order": 3,
      "version": 1
    },
    {
      "id": "8182f23f-fbe7-5368-ad01-d92dd015ed80",
      "name": "Ciruelas y tocineta",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 0,
      "version": 1
    },
    {
      "id": "423de20b-9503-56eb-a764-e73b6b39ad4d",
      "name": "Hawaiana",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 1,
      "version": 1
    },
    {
      "id": "c3df5e02-fe7b-5421-a657-1857db594e7d",
      "name": "Jamón con pollo",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 2,
      "version": 1
    },
    {
      "id": "85f20433-cce5-5d09-af64-3de25ed48cdb",
      "name": "Durazno con peperoni",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 3,
      "version": 1
    },
    {
      "id": "45731f77-4576-5c78-a25b-1da327bc6d30",
      "name": "Salami con peperoni",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 4,
      "version": 1
    },
    {
      "id": "bbf97d91-6f3c-5160-aab3-4823147839ab",
      "name": "Chorizo con maicitos",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 5,
      "version": 1
    },
    {
      "id": "7388aaa6-6c47-5b31-a5cc-f02e47932344",
      "name": "Napolitana",
      "kind": "Sabor pizza sencilla",
      "price": 0,
      "available": true,
      "sort_order": 6,
      "version": 1
    }
  ]
};
// Carga inicial de la carta proporcionada por Don Pieros Pizza.
function dpSeedInitialMenu_(spreadsheet) {
  var properties=PropertiesService.getScriptProperties();
  if(properties.getProperty('DP_INITIAL_MENU_LOADED')==='1'){dpFillInitialMeasurements_(spreadsheet);return {ok:true,alreadyLoaded:true};}
  var counts={products:0,toppings:0};
  ['toppings','products'].forEach(function(key){
    var definition=DP_TABLES[key],sheet=spreadsheet.getSheetByName(definition.name),rows=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,definition.headers.length).getValues():[],ids={},names={};
    rows.forEach(function(row){ids[String(row[0])]=true;names[String(row[1]).trim().toLowerCase()+'|'+String(row[2]).trim().toLowerCase()]=true;});
    var missing=DP_INITIAL_MENU[key].filter(function(item){return !ids[item.id]&&!names[item.name.toLowerCase()+'|'+String(item.category||item.kind).toLowerCase()];});
    var cells=missing.map(function(item){return definition.headers.map(function(header){var value=item[header];return header==='modifiers'?JSON.stringify(value||[]):value==null?'':value;});});
    if(cells.length)sheet.getRange(sheet.getLastRow()+1,1,cells.length,definition.headers.length).setValues(cells);
    counts[key]=cells.length;
  });
  SpreadsheetApp.flush();dpInvalidateCatalog_();properties.setProperty('DP_INITIAL_MENU_LOADED','1');properties.setProperty('DP_MENU_MEASUREMENTS_LOADED','1');
  return {ok:true,added:counts};
}

function dpFillInitialMeasurements_(spreadsheet) {
  var props=PropertiesService.getScriptProperties();if(props.getProperty('DP_MENU_MEASUREMENTS_LOADED')==='1')return;
  var sheet=spreadsheet.getSheetByName(DP_TABLES.toppings.name),last=sheet.getLastRow(),rows=last>1?sheet.getRange(2,1,last-1,DP_TABLES.toppings.headers.length).getValues():[],targets={};
  DP_INITIAL_MENU.toppings.forEach(function(item){if(item.kind.indexOf('Tamaño pizza')===0)targets[item.id]=item;});
  rows.forEach(function(row,index){var target=targets[String(row[0])];if(target&&['Mini','Mediana','Maxi','Super maxi'].indexOf(String(row[1]))>=0){row[1]=target.name;row[6]=(Number(row[6])||0)+1;sheet.getRange(index+2,1,1,row.length).setValues([row]);}});
  sheet=spreadsheet.getSheetByName(DP_TABLES.products.name);last=sheet.getLastRow();rows=last>1?sheet.getRange(2,1,last-1,DP_TABLES.products.headers.length).getValues():[];
  rows.forEach(function(row,index){if(row[2]==='Pizzetas'&&!row[7]){row[7]='24 × 24 cm';row[12]=(Number(row[12])||0)+1;sheet.getRange(index+2,1,1,row.length).setValues([row]);}});
  dpInvalidateCatalog_();props.setProperty('DP_MENU_MEASUREMENTS_LOADED','1');
}

function CARGAR_MENU_INICIAL_DON_PIEROS() {
  var spreadsheet=ensureSystemReady_();
  return dpWithLock_(function(){return dpSeedInitialMenu_(spreadsheet);});
}
