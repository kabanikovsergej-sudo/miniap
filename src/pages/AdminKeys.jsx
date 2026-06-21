import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api"; // если у тебя путь другой — скажешь, поправим
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { Search, RefreshCw, Pencil, Check, X } from "lucide-react";

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export default function AdminKeys() {
  
  // ✅ Access: ADMIN or STAFF
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleDenied, setRoleDenied] = useState(false);
  const [myRole, setMyRole] = useState("unknown");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await api("/me");
        if (!mounted) return;
        const role = String(me?.role || me?.user?.role || "").toLowerCase();
        setMyRole(role || "unknown");
        const ok = ["admin", "owner", "superadmin"].includes(role);
        setRoleDenied(!ok);
      } catch {
        if (!mounted) return;
        setMyRole("unknown");
        setRoleDenied(true);
      } finally {
        if (mounted) setRoleLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);
const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");

  const [editId, setEditId] = useState(null);
  const [editTag, setEditTag] = useState("");
  const [editUser, setEditUser] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await api("/admin/keys"); // backend отдаёт массив
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(safeStr(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!roleLoading && !roleDenied) load();
  }, [roleLoading, roleDenied]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => {
      const code = safeStr(x.code || x.key || x.id).toLowerCase();
      const tag = safeStr(x.tag).toLowerCase();
      const au = safeStr(x.assigned_user).toLowerCase();
      return code.includes(s) || tag.includes(s) || au.includes(s);
    });
  }, [items, q]);

  function startEdit(row) {
    const id = row.code || row.key || row.id;
    setEditId(id);
    setEditTag(safeStr(row.tag));
    setEditUser(safeStr(row.assigned_user));
  }

  function cancelEdit() {
    setEditId(null);
    setEditTag("");
    setEditUser("");
    setSaving(false);
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    setErr("");
    try {
      const body = { tag: editTag, assigned_user: editUser };
      await api(`/admin/keys/${encodeURIComponent(editId)}/meta`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      // обновим локально, чтобы не ждать перезагрузку
      setItems((prev) =>
        prev.map((x) => {
          const id = x.code || x.key || x.id;
          if (id !== editId) return x;
          return { ...x, tag: editTag, assigned_user: editUser };
        })
      );

      cancelEdit();
    } catch (e) {
      setErr(safeStr(e?.message || e));
      setSaving(false);
    }
  }
  if (roleLoading) {
    return (
      <div className="p-6 text-white/80">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          Загружаю доступ…
        </div>
      </div>
    );
  }

  if (roleDenied) {
    return (
      <div className="p-6 text-white/80">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-xl font-bold text-white">Нет доступа</div>
          <div className="mt-2 text-sm text-white/60">
            Эта вкладка доступна только ролям <span className="font-semibold text-white">ADMIN</span> и <span className="font-semibold text-white">STAFF</span>.
          </div>
          <div className="mt-3 text-xs text-white/40">Твоя роль: {myRole || "unknown"}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Admin • Keys</h1>
          <p className="text-white/60 text-sm mt-1">
            Редактируй <span className="font-medium">tag</span> и{" "}
            <span className="font-medium">assigned_user</span> у ключей (PATCH /admin/keys/:id/meta)
          </p>
        </div>

        <Button onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Обновить
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="h-4 w-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по коду / tag / user…"
            className="pl-9"
          />
        </div>

        <Badge variant="secondary" className="bg-white/10 text-white/80">
          {filtered.length} / {items.length}
        </Badge>
      </div>

      {err ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">
          {err}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 bg-white/5 px-4 py-3 text-white/70 text-xs">
          <div className="col-span-4">CODE</div>
          <div className="col-span-2">DAYS</div>
          <div className="col-span-2">USED</div>
          <div className="col-span-2">TAG</div>
          <div className="col-span-1">USER</div>
          <div className="col-span-1 text-right">EDIT</div>
        </div>

        {loading ? (
          <div className="p-4 text-white/60">Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-white/60">Ничего не найдено.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {filtered.map((row) => {
              const id = row.code || row.key || row.id;
              const isEditing = editId === id;

              return (
                <div key={id} className="px-4 py-3">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <div className="font-mono text-sm">{id}</div>
                      <div className="text-xs text-white/50 mt-0.5">
                        created: {safeStr(row.created_at || "")}
                      </div>
                    </div>

                    <div className="col-span-2 text-sm text-white/80">
                      {row.vip_days ?? row.duration ?? "-"}
                    </div>

                    <div className="col-span-2 text-sm text-white/80">
                      {row.used_count != null ? `${row.used_count}/${row.max_uses ?? 1}` : (row.used ? "yes" : "no")}
                    </div>

                    <div className="col-span-2">
                      {isEditing ? (
                        <Input value={editTag} onChange={(e) => setEditTag(e.target.value)} />
                      ) : (
                        <div className="text-sm text-white/80 truncate">{safeStr(row.tag) || "-"}</div>
                      )}
                    </div>

                    <div className="col-span-1">
                      {isEditing ? (
                        <Input value={editUser} onChange={(e) => setEditUser(e.target.value)} />
                      ) : (
                        <div className="text-sm text-white/80 truncate">{safeStr(row.assigned_user) || "-"}</div>
                      )}
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {!isEditing ? (
                        <Button
                          variant="secondary"
                          className="bg-white/10 hover:bg-white/15"
                          onClick={() => startEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={saveEdit}
                            disabled={saving}
                            className="gap-2"
                          >
                            <Check className="h-4 w-4" />
                            Save
                          </Button>
                          <Button
                            variant="secondary"
                            className="bg-white/10 hover:bg-white/15"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isEditing ? (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="mt-2 text-xs text-white/50"
                      >
                        ENTER чтобы сохранить — не делал специально. Сохраняй кнопкой.
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
