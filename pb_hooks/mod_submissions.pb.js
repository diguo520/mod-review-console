/// <reference path="../pb_data/types.d.ts" />
// pb_hooks/mod_submissions.pb.js — 业务 collection + REST CRUD 路由 (self-contained)
//
// 由 mcp__rh-pb-hooks__install_business_collection 装. 不要直接 Read+Write 这个文件.
// 业务字段: mod_id:text, display_name:text, version:text, category:text, tags:text, description:text, author_id:text, author_name:text, author_key_id:text, repo_owner:text, repo_name:text, release_tag:text, download_url:text, size_bytes:number, sha256:text, check_results:json, review_status:text, review_mode:text, review_reason:text, reviewed_at:date, submitted_at:date, repo_alive:bool, last_repo_check_at:date
// 路由: list,get,create,update,delete
// list filter 字段: review_status,mod_id,category
// list 默认排序: -created

onBootstrap(function (e) {
  e.next()
  try {
    var existing = null
    try { existing = $app.findCollectionByNameOrId("mod_submissions") } catch (_) { existing = null }
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
      addField({ name: 'display_name', type: 'text', required: true })
      addField({ name: 'version', type: 'text' })
      addField({ name: 'category', type: 'text' })
      addField({ name: 'tags', type: 'text' })
      addField({ name: 'description', type: 'text' })
      addField({ name: 'author_id', type: 'text' })
      addField({ name: 'author_name', type: 'text' })
      addField({ name: 'author_key_id', type: 'text' })
      addField({ name: 'repo_owner', type: 'text' })
      addField({ name: 'repo_name', type: 'text' })
      addField({ name: 'release_tag', type: 'text' })
      addField({ name: 'download_url', type: 'text' })
      addField({ name: 'size_bytes', type: 'number' })
      addField({ name: 'sha256', type: 'text' })
      addField({ name: 'check_results', type: 'json' })
      addField({ name: 'review_status', type: 'text', required: true })
      addField({ name: 'review_mode', type: 'text' })
      addField({ name: 'review_reason', type: 'text' })
      addField({ name: 'reviewed_at', type: 'date' })
      addField({ name: 'submitted_at', type: 'date' })
      addField({ name: 'repo_alive', type: 'bool' })
      addField({ name: 'last_repo_check_at', type: 'date' })
      addField({ name: "created", type: "autodate", onCreate: true })
      addField({ name: "updated", type: "autodate", onCreate: true, onUpdate: true })
      if (changed) {
        $app.save(existing)
        try { $app.logger().info("mod_submissions collection upgraded") } catch (_) {}
      }
    } else {
      var col = new Collection({
        type: "base",
        name: "mod_submissions",
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
          { name: 'mod_id', type: 'text', required: true },
          { name: 'display_name', type: 'text', required: true },
          { name: 'version', type: 'text' },
          { name: 'category', type: 'text' },
          { name: 'tags', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'author_id', type: 'text' },
          { name: 'author_name', type: 'text' },
          { name: 'author_key_id', type: 'text' },
          { name: 'repo_owner', type: 'text' },
          { name: 'repo_name', type: 'text' },
          { name: 'release_tag', type: 'text' },
          { name: 'download_url', type: 'text' },
          { name: 'size_bytes', type: 'number' },
          { name: 'sha256', type: 'text' },
          { name: 'check_results', type: 'json' },
          { name: 'review_status', type: 'text', required: true },
          { name: 'review_mode', type: 'text' },
          { name: 'review_reason', type: 'text' },
          { name: 'reviewed_at', type: 'date' },
          { name: 'submitted_at', type: 'date' },
          { name: 'repo_alive', type: 'bool' },
          { name: 'last_repo_check_at', type: 'date' },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      })
      $app.save(col)
      try { $app.logger().info("mod_submissions collection created") } catch (_) {}
    }
  } catch (err) {
    try { $app.logger().error("mod_submissions bootstrap: " + String(err && err.message || err)) } catch (_) {}
  }
})

// GET /api/mod_submissions?page=1&perPage=50&sort=-created&review_status=...&mod_id=...&category=...
routerAdd("GET", "/api/mod_submissions", function (e) {
  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("mod_submissions") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "mod_submissions",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'mod_id', type: 'text', required: true },
          { name: 'display_name', type: 'text', required: true },
          { name: 'version', type: 'text' },
          { name: 'category', type: 'text' },
          { name: 'tags', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'author_id', type: 'text' },
          { name: 'author_name', type: 'text' },
          { name: 'author_key_id', type: 'text' },
          { name: 'repo_owner', type: 'text' },
          { name: 'repo_name', type: 'text' },
          { name: 'release_tag', type: 'text' },
          { name: 'download_url', type: 'text' },
          { name: 'size_bytes', type: 'number' },
          { name: 'sha256', type: 'text' },
          { name: 'check_results', type: 'json' },
          { name: 'review_status', type: 'text', required: true },
          { name: 'review_mode', type: 'text' },
          { name: 'review_reason', type: 'text' },
          { name: 'reviewed_at', type: 'date' },
          { name: 'submitted_at', type: 'date' },
          { name: 'repo_alive', type: 'bool' },
          { name: 'last_repo_check_at', type: 'date' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("mod_submissions")
  }
  try {
    ensureCollLocal()
    var info = e.requestInfo()
    var query = info.query || {}
    var page = parseInt(String(query.page || "1"), 10) || 1
    var perPage = parseInt(String(query.perPage || "50"), 10) || 50
    if (perPage > 200) perPage = 200
    var sort = String(query.sort || "-created")
    var filterParts = []
    var params = {}
    if (query.review_status !== undefined && query.review_status !== "") {
      filterParts.push("review_status = {:review_status}")
      params.review_status = String(query.review_status)
    }
    if (query.mod_id !== undefined && query.mod_id !== "") {
      filterParts.push("mod_id = {:mod_id}")
      params.mod_id = String(query.mod_id)
    }
    if (query.category !== undefined && query.category !== "") {
      filterParts.push("category = {:category}")
      params.category = String(query.category)
    }
    var filter = filterParts.length > 0 ? filterParts.join(" && ") : ""
    var records = filter
      ? $app.findRecordsByFilter("mod_submissions", filter, sort, perPage, (page - 1) * perPage, params)
      : $app.findRecordsByFilter("mod_submissions", "", sort, perPage, (page - 1) * perPage)
    var items = []
    for (var i = 0; i < records.length; i++) {
      items.push(records[i].publicExport())
    }
    return e.json(200, { items: items, page: page, perPage: perPage, totalItems: items.length })
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("mod_submissions list: " + msg) } catch (_) {}
    return e.json(500, { error: "list_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// GET /api/mod_submissions/{id}
routerAdd("GET", "/api/mod_submissions/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("mod_submissions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "get_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// POST /api/mod_submissions  body 字段: mod_id, display_name, version, category, tags, description, author_id, author_name, author_key_id, repo_owner, repo_name, release_tag, download_url, size_bytes, sha256, check_results, review_status, review_mode, review_reason, reviewed_at, submitted_at, repo_alive, last_repo_check_at
routerAdd("POST", "/api/mod_submissions", function (e) {
  function ensureCollLocal() {
    try { return $app.findCollectionByNameOrId("mod_submissions") } catch (_) {}
    var col = new Collection({
      type: "base",
      name: "mod_submissions",
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      fields: [
          { name: 'mod_id', type: 'text', required: true },
          { name: 'display_name', type: 'text', required: true },
          { name: 'version', type: 'text' },
          { name: 'category', type: 'text' },
          { name: 'tags', type: 'text' },
          { name: 'description', type: 'text' },
          { name: 'author_id', type: 'text' },
          { name: 'author_name', type: 'text' },
          { name: 'author_key_id', type: 'text' },
          { name: 'repo_owner', type: 'text' },
          { name: 'repo_name', type: 'text' },
          { name: 'release_tag', type: 'text' },
          { name: 'download_url', type: 'text' },
          { name: 'size_bytes', type: 'number' },
          { name: 'sha256', type: 'text' },
          { name: 'check_results', type: 'json' },
          { name: 'review_status', type: 'text', required: true },
          { name: 'review_mode', type: 'text' },
          { name: 'review_reason', type: 'text' },
          { name: 'reviewed_at', type: 'date' },
          { name: 'submitted_at', type: 'date' },
          { name: 'repo_alive', type: 'bool' },
          { name: 'last_repo_check_at', type: 'date' },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    })
    $app.save(col)
    return $app.findCollectionByNameOrId("mod_submissions")
  }
  try {
    var coll = ensureCollLocal()
    var body = e.requestInfo().body || {}
    var rec = new Record(coll)
    rec.set("mod_id", body.mod_id === undefined || body.mod_id === null ? "" : String(body.mod_id))
    rec.set("display_name", body.display_name === undefined || body.display_name === null ? "" : String(body.display_name))
    rec.set("version", body.version === undefined || body.version === null ? "" : String(body.version))
    rec.set("category", body.category === undefined || body.category === null ? "" : String(body.category))
    rec.set("tags", body.tags === undefined || body.tags === null ? "" : String(body.tags))
    rec.set("description", body.description === undefined || body.description === null ? "" : String(body.description))
    rec.set("author_id", body.author_id === undefined || body.author_id === null ? "" : String(body.author_id))
    rec.set("author_name", body.author_name === undefined || body.author_name === null ? "" : String(body.author_name))
    rec.set("author_key_id", body.author_key_id === undefined || body.author_key_id === null ? "" : String(body.author_key_id))
    rec.set("repo_owner", body.repo_owner === undefined || body.repo_owner === null ? "" : String(body.repo_owner))
    rec.set("repo_name", body.repo_name === undefined || body.repo_name === null ? "" : String(body.repo_name))
    rec.set("release_tag", body.release_tag === undefined || body.release_tag === null ? "" : String(body.release_tag))
    rec.set("download_url", body.download_url === undefined || body.download_url === null ? "" : String(body.download_url))
    rec.set("size_bytes", (body.size_bytes === undefined || body.size_bytes === null) ? 0 : Number(body.size_bytes))
    rec.set("sha256", body.sha256 === undefined || body.sha256 === null ? "" : String(body.sha256))
    rec.set("check_results", body.check_results)
    rec.set("review_status", body.review_status === undefined || body.review_status === null ? "" : String(body.review_status))
    rec.set("review_mode", body.review_mode === undefined || body.review_mode === null ? "" : String(body.review_mode))
    rec.set("review_reason", body.review_reason === undefined || body.review_reason === null ? "" : String(body.review_reason))
    rec.set("reviewed_at", body.reviewed_at === undefined || body.reviewed_at === null ? "" : String(body.reviewed_at))
    rec.set("submitted_at", body.submitted_at === undefined || body.submitted_at === null ? "" : String(body.submitted_at))
    rec.set("repo_alive", !!body.repo_alive)
    rec.set("last_repo_check_at", body.last_repo_check_at === undefined || body.last_repo_check_at === null ? "" : String(body.last_repo_check_at))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    try { $app.logger().error("mod_submissions create: " + msg) } catch (_) {}
    return e.json(500, { error: "create_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// PATCH /api/mod_submissions/{id}  body 字段同 POST, 只更新 body 里出现的字段
routerAdd("PATCH", "/api/mod_submissions/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("mod_submissions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    var body = e.requestInfo().body || {}
    if ("mod_id" in body) rec.set("mod_id", body.mod_id === undefined || body.mod_id === null ? "" : String(body.mod_id))
    if ("display_name" in body) rec.set("display_name", body.display_name === undefined || body.display_name === null ? "" : String(body.display_name))
    if ("version" in body) rec.set("version", body.version === undefined || body.version === null ? "" : String(body.version))
    if ("category" in body) rec.set("category", body.category === undefined || body.category === null ? "" : String(body.category))
    if ("tags" in body) rec.set("tags", body.tags === undefined || body.tags === null ? "" : String(body.tags))
    if ("description" in body) rec.set("description", body.description === undefined || body.description === null ? "" : String(body.description))
    if ("author_id" in body) rec.set("author_id", body.author_id === undefined || body.author_id === null ? "" : String(body.author_id))
    if ("author_name" in body) rec.set("author_name", body.author_name === undefined || body.author_name === null ? "" : String(body.author_name))
    if ("author_key_id" in body) rec.set("author_key_id", body.author_key_id === undefined || body.author_key_id === null ? "" : String(body.author_key_id))
    if ("repo_owner" in body) rec.set("repo_owner", body.repo_owner === undefined || body.repo_owner === null ? "" : String(body.repo_owner))
    if ("repo_name" in body) rec.set("repo_name", body.repo_name === undefined || body.repo_name === null ? "" : String(body.repo_name))
    if ("release_tag" in body) rec.set("release_tag", body.release_tag === undefined || body.release_tag === null ? "" : String(body.release_tag))
    if ("download_url" in body) rec.set("download_url", body.download_url === undefined || body.download_url === null ? "" : String(body.download_url))
    if ("size_bytes" in body) rec.set("size_bytes", (body.size_bytes === undefined || body.size_bytes === null) ? 0 : Number(body.size_bytes))
    if ("sha256" in body) rec.set("sha256", body.sha256 === undefined || body.sha256 === null ? "" : String(body.sha256))
    if ("check_results" in body) rec.set("check_results", body.check_results)
    if ("review_status" in body) rec.set("review_status", body.review_status === undefined || body.review_status === null ? "" : String(body.review_status))
    if ("review_mode" in body) rec.set("review_mode", body.review_mode === undefined || body.review_mode === null ? "" : String(body.review_mode))
    if ("review_reason" in body) rec.set("review_reason", body.review_reason === undefined || body.review_reason === null ? "" : String(body.review_reason))
    if ("reviewed_at" in body) rec.set("reviewed_at", body.reviewed_at === undefined || body.reviewed_at === null ? "" : String(body.reviewed_at))
    if ("submitted_at" in body) rec.set("submitted_at", body.submitted_at === undefined || body.submitted_at === null ? "" : String(body.submitted_at))
    if ("repo_alive" in body) rec.set("repo_alive", !!body.repo_alive)
    if ("last_repo_check_at" in body) rec.set("last_repo_check_at", body.last_repo_check_at === undefined || body.last_repo_check_at === null ? "" : String(body.last_repo_check_at))
    $app.save(rec)
    return e.json(200, rec.publicExport())
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "update_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
// DELETE /api/mod_submissions/{id}
routerAdd("DELETE", "/api/mod_submissions/{id}", function (e) {
  try {
    var id = e.request.pathValue("id")
    if (!id) return e.json(400, { error: "id_required" })
    var rec = null
    try { rec = $app.findRecordById("mod_submissions", id) } catch (_) { rec = null }
    if (!rec) return e.json(404, { error: "not_found" })
    $app.delete(rec)
    return e.json(200, { ok: true })
  } catch (err) {
    var msg = String(err && err.message || err)
    return e.json(500, { error: "delete_failed", message: msg, fingerprint: msg.substring(0, 80) })
  }
})
