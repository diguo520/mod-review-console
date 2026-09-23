/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/mod_decisions.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: target:text, kind:text, action:text, reason_zh:text, reason_en:text, operator:text, decided_at:text, applied:bool
// 路由: list,get,create,update,delete
// list filter 字段: target,action,kind
// list 默认排序: -decided_at

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("mod_decisions") } catch (_) { existing = null }
    if (existing) {
      var changed = false
      function hasField(name) {
        try { return !!existing.fields.getByName(name) } catch (_) {}
        try {
          for (var i = 0; i < existing.fields.length; i++) {
            if (String(existing.fields[i].name) === String(name)) return true
          }
        } catch (_) {}
        return false
      }
      function addField(def) {
        if (hasField(def.name)) return
        try { existing.fields.add(new Field(def)); changed = true } catch (_) {}
      }
      addField({ name: 'target', type: 'text', required: true })
      addField({ name: 'kind', type: 'text' })
      addField({ name: 'action', type: 'text' })
      addField({ name: 'reason_zh', type: 'text' })
      addField({ name: 'reason_en', type: 'text' })
      addField({ name: 'operator', type: 'text' })
      addField({ name: 'decided_at', type: 'text' })
      addField({ name: 'applied', type: 'bool' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("mod_decisions collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "mod_decisions",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'target', type: 'text', required: true },
          { name: 'kind', type: 'text' },
          { name: 'action', type: 'text' },
          { name: 'reason_zh', type: 'text' },
          { name: 'reason_en', type: 'text' },
          { name: 'operator', type: 'text' },
          { name: 'decided_at', type: 'text' },
          { name: 'applied', type: 'bool' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("mod_decisions collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("mod_decisions bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/mod_decisions?page=1&perPage=50&sort=-created&target=...&action=...&kind=...
routerAdd("GET", "/api/mod_decisions", function (e) {
  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("mod_decisions") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "mod_decisions",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'target', type: 'text', required: true },
          { name: 'kind', type: 'text' },
          { name: 'action', type: 'text' },
          { name: 'reason_zh', type: 'text' },
          { name: 'reason_en', type: 'text' },
          { name: 'operator', type: 'text' },
          { name: 'decided_at', type: 'text' },
          { name: 'applied', type: 'bool' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("mod_decisions")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "-decided_at")
    var filterParts = []
    var params = {}
    if (query.target !== undefined && query.target !== "") {
      filterParts.push("target = {:target}")
      params.target = String(query.target)
    }
    if (query.action !== undefined && query.action !== "") {
      filterParts.push("action = {:action}")
      params.action = String(query.action)
    }
    if (query.kind !== undefined && query.kind !== "") {
      filterParts.push("kind = {:kind}")
      params.kind = String(query.kind)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("mod_decisions", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("mod_decisions", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("mod_decisions list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// GET /api/mod_decisions/{id}
routerAdd("GET", "/api/mod_decisions/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("mod_decisions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "get_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// POST /api/mod_decisions  body 字段: target, kind, action, reason_zh, reason_en, operator, decided_at, applied
routerAdd("POST", "/api/mod_decisions", function (e) {
  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("mod_decisions") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "mod_decisions",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'target', type: 'text', required: true },
          { name: 'kind', type: 'text' },
          { name: 'action', type: 'text' },
          { name: 'reason_zh', type: 'text' },
          { name: 'reason_en', type: 'text' },
          { name: 'operator', type: 'text' },
          { name: 'decided_at', type: 'text' },
          { name: 'applied', type: 'bool' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("mod_decisions")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("target", body.target === undefined || body.target === null ? "" : String(body.target))
    rec.set("kind", body.kind === undefined || body.kind === null ? "" : String(body.kind))
    rec.set("action", body.action === undefined || body.action === null ? "" : String(body.action))
    rec.set("reason_zh", body.reason_zh === undefined || body.reason_zh === null ? "" : String(body.reason_zh))
    rec.set("reason_en", body.reason_en === undefined || body.reason_en === null ? "" : String(body.reason_en))
    rec.set("operator", body.operator === undefined || body.operator === null ? "" : String(body.operator))
    rec.set("decided_at", body.decided_at === undefined || body.decided_at === null ? "" : String(body.decided_at))
    rec.set("applied", !!body.applied)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("mod_decisions create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/mod_decisions/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/mod_decisions/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("mod_decisions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("target" in body) rec.set("target", body.target === undefined || body.target === null ? "" : String(body.target))
    if ("kind" in body) rec.set("kind", body.kind === undefined || body.kind === null ? "" : String(body.kind))
    if ("action" in body) rec.set("action", body.action === undefined || body.action === null ? "" : String(body.action))
    if ("reason_zh" in body) rec.set("reason_zh", body.reason_zh === undefined || body.reason_zh === null ? "" : String(body.reason_zh))
    if ("reason_en" in body) rec.set("reason_en", body.reason_en === undefined || body.reason_en === null ? "" : String(body.reason_en))
    if ("operator" in body) rec.set("operator", body.operator === undefined || body.operator === null ? "" : String(body.operator))
    if ("decided_at" in body) rec.set("decided_at", body.decided_at === undefined || body.decided_at === null ? "" : String(body.decided_at))
    if ("applied" in body) rec.set("applied", !!body.applied)
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/mod_decisions/{id}
routerAdd("DELETE", "/api/mod_decisions/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("mod_decisions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
