/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/repo_checks.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: mod_id:text, mod_name:text, repo_url:text, alive:bool, detail:text, checked_at:date
// 路由: list,get,create,update,delete
// list filter 字段: mod_id
// list 默认排序: -checked_at

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("repo_checks") } catch (_) { existing = null }
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
      addField({ name: 'mod_id', type: 'text', required: true })
      addField({ name: 'mod_name', type: 'text' })
      addField({ name: 'repo_url', type: 'text' })
      addField({ name: 'alive', type: 'bool' })
      addField({ name: 'detail', type: 'text' })
      addField({ name: 'checked_at', type: 'date' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("repo_checks collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "repo_checks",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'mod_id', type: 'text', required: true },
          { name: 'mod_name', type: 'text' },
          { name: 'repo_url', type: 'text' },
          { name: 'alive', type: 'bool' },
          { name: 'detail', type: 'text' },
          { name: 'checked_at', type: 'date' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("repo_checks collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("repo_checks bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/repo_checks?page=1&perPage=50&sort=-created&mod_id=...
routerAdd("GET", "/api/repo_checks", function (e) {
  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("repo_checks") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "repo_checks",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'mod_id', type: 'text', required: true },
          { name: 'mod_name', type: 'text' },
          { name: 'repo_url', type: 'text' },
          { name: 'alive', type: 'bool' },
          { name: 'detail', type: 'text' },
          { name: 'checked_at', type: 'date' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("repo_checks")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "-checked_at")
    var filterParts = []
    var params = {}
    if (query.mod_id !== undefined && query.mod_id !== "") {
      filterParts.push("mod_id = {:mod_id}")
      params.mod_id = String(query.mod_id)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("repo_checks", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("repo_checks", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("repo_checks list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// GET /api/repo_checks/{id}
routerAdd("GET", "/api/repo_checks/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("repo_checks", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "get_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// POST /api/repo_checks  body 字段: mod_id, mod_name, repo_url, alive, detail, checked_at
routerAdd("POST", "/api/repo_checks", function (e) {
  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("repo_checks") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "repo_checks",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'mod_id', type: 'text', required: true },
          { name: 'mod_name', type: 'text' },
          { name: 'repo_url', type: 'text' },
          { name: 'alive', type: 'bool' },
          { name: 'detail', type: 'text' },
          { name: 'checked_at', type: 'date' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("repo_checks")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("mod_id", body.mod_id === undefined || body.mod_id === null ? "" : String(body.mod_id))
    rec.set("mod_name", body.mod_name === undefined || body.mod_name === null ? "" : String(body.mod_name))
    rec.set("repo_url", body.repo_url === undefined || body.repo_url === null ? "" : String(body.repo_url))
    rec.set("alive", !!body.alive)
    rec.set("detail", body.detail === undefined || body.detail === null ? "" : String(body.detail))
    rec.set("checked_at", body.checked_at === undefined || body.checked_at === null ? "" : String(body.checked_at))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("repo_checks create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/repo_checks/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/repo_checks/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("repo_checks", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("mod_id" in body) rec.set("mod_id", body.mod_id === undefined || body.mod_id === null ? "" : String(body.mod_id))
    if ("mod_name" in body) rec.set("mod_name", body.mod_name === undefined || body.mod_name === null ? "" : String(body.mod_name))
    if ("repo_url" in body) rec.set("repo_url", body.repo_url === undefined || body.repo_url === null ? "" : String(body.repo_url))
    if ("alive" in body) rec.set("alive", !!body.alive)
    if ("detail" in body) rec.set("detail", body.detail === undefined || body.detail === null ? "" : String(body.detail))
    if ("checked_at" in body) rec.set("checked_at", body.checked_at === undefined || body.checked_at === null ? "" : String(body.checked_at))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/repo_checks/{id}
routerAdd("DELETE", "/api/repo_checks/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("repo_checks", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
