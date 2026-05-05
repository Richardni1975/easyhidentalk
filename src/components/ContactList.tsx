import { useState, useEffect } from "react";

interface Contact {
  name: string;
  email: string;
}

interface ContactListProps {
  roomId: string;
  onClose: () => void;
}

const STORAGE_KEY = "video_meeting_contacts";

function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export default function ContactList({ roomId, onClose }: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setContacts(loadContacts());
  }, []);

  const addContact = () => {
    if (!name.trim() || !email.trim()) return;
    const newContact = { name: name.trim(), email: email.trim() };
    const updated = [...contacts, newContact];
    setContacts(updated);
    saveContacts(updated);
    setName("");
    setEmail("");
  };

  const deleteContact = (index: number) => {
    const updated = contacts.filter((_, i) => i !== index);
    setContacts(updated);
    saveContacts(updated);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const toggleSelect = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const meetingUrl = `${window.location.origin}/meeting/${roomId}`;

  const sendInvite = () => {
    const selectedContacts = Array.from(selected).map((i) => contacts[i]);
    if (selectedContacts.length === 0) return;

    const recipients = selectedContacts.map((c) => c.email).join(",");
    const subject = encodeURIComponent("视频会议邀请");
    const body = encodeURIComponent(
      `您好，\n\n邀请您参加视频会议。\n\n会议地址：${meetingUrl}\n房间号：${roomId}\n\n点击链接即可加入会议。`
    );
    window.open(`mailto:${recipients}?subject=${subject}&body=${body}`, "_blank");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(meetingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const selectAll = () => {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((_, i) => i)));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-800 w-full max-w-md mx-4 rounded-xl border border-dark-700 shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700">
          <h3 className="text-white font-semibold text-base">📧 通讯录与邀请</h3>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Add contact form */}
        <div className="px-5 py-3 border-b border-dark-700/50">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="姓名"
              className="flex-1 bg-dark-900 text-white text-xs px-3 py-2 rounded border border-dark-600 focus:outline-none focus:border-blue-500 placeholder-dark-500"
              onKeyDown={(e) => e.key === "Enter" && addContact()}
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱地址"
              type="email"
              className="flex-[2] bg-dark-900 text-white text-xs px-3 py-2 rounded border border-dark-600 focus:outline-none focus:border-blue-500 placeholder-dark-500"
              onKeyDown={(e) => e.key === "Enter" && addContact()}
            />
            <button
              onClick={addContact}
              disabled={!name.trim() || !email.trim()}
              className="px-3 py-2 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-dark-600 disabled:text-dark-500 text-white transition-colors"
            >
              +添加
            </button>
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {contacts.length === 0 ? (
            <p className="text-dark-500 text-xs text-center py-6">
              还没有联系人，在上方添加
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1 py-1">
                <label className="flex items-center gap-1.5 text-xs text-dark-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === contacts.length}
                    onChange={selectAll}
                    className="accent-blue-500"
                  />
                  全选
                </label>
                <span className="text-dark-600 text-xs">
                  {selected.size}/{contacts.length}
                </span>
              </div>
              {contacts.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-dark-700/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleSelect(i)}
                    className="accent-blue-500 flex-shrink-0"
                  />
                  <div className="w-7 h-7 rounded-full bg-dark-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-dark-300">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium truncate">{c.name}</p>
                    <p className="text-dark-400 text-[10px] truncate">{c.email}</p>
                  </div>
                  <button
                    onClick={() => deleteContact(i)}
                    className="text-dark-500 hover:text-red-400 transition-colors text-xs flex-shrink-0 px-1"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-dark-700 flex gap-2">
          <button
            onClick={sendInvite}
            disabled={selected.size === 0}
            className="flex-1 px-3 py-2 rounded text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-dark-600 disabled:text-dark-500 text-white transition-colors font-medium"
          >
            发送邀请（邮件）
          </button>
          <button
            onClick={copyLink}
            className="px-3 py-2 rounded text-xs bg-dark-700 hover:bg-dark-600 text-dark-200 transition-colors font-medium"
          >
            {copied ? "✅ 已复制" : "复制链接"}
          </button>
        </div>
      </div>
    </div>
  );
}
