import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Send, Phone, RefreshCw, ChevronLeft, User, Tag, StickyNote, X } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { inboxAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// ── Label config ──────────────────────────────────────────────────────────────
const CHAT_LABELS = [
  { key: 'follow_up',   label: 'Follow Up',    color: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-400' },
  { key: 'active',      label: 'Active',        color: 'bg-green-100 text-green-700',    dot: 'bg-green-400' },
  { key: 'closed',      label: 'Closed',        color: 'bg-gray-100 text-gray-500',      dot: 'bg-gray-400' },
  { key: 'no_response', label: 'No Response',   color: 'bg-red-100 text-red-600',        dot: 'bg-red-400' },
];
const labelMap = Object.fromEntries(CHAT_LABELS.map((l) => [l.key, l]));

const BIZ_BADGE = {
  sofashine:     'bg-blue-100 text-blue-700',
  cleancruisers: 'bg-purple-100 text-purple-700',
};

const STAGE_BADGE = {
  new:       'bg-blue-50 text-blue-600',
  quoted:    'bg-yellow-50 text-yellow-700',
  follow_up: 'bg-purple-50 text-purple-700',
  booked:    'bg-green-50 text-green-700',
  lost:      'bg-red-50 text-red-500',
};

const STEP_LABEL = {
  AWAITING_SERVICE:        'Selecting service',
  AWAITING_SUBSERVICE:     'Selecting sub-service',
  AWAITING_CUSTOM_REQUEST: 'Custom request',
  AWAITING_ADD_MORE:       'Adding more',
  AWAITING_DATE:           'Choosing date',
  AWAITING_TIME:           'Choosing time',
  AWAITING_ADDRESS:        'Entering address',
  AWAITING_NAME:           'Entering name',
  AWAITING_CONFIRM:        'Confirming booking',
  COMPLETED:               'Done ✓',
};

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const fmtConvDate = (d) => {
  const date  = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return fmtTime(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

// ── Label badge component ─────────────────────────────────────────────────────
function LabelBadge({ labelKey, small = false }) {
  const cfg = labelMap[labelKey];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${small ? 'text-xs px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Note modal ────────────────────────────────────────────────────────────────
function NoteModal({ phone, businessId, currentNote, onClose, onSaved }) {
  const [note, setNote] = useState(currentNote || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await inboxAPI.updateLabel(phone, { businessId, note });
      onSaved(note);
      onClose();
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900 text-sm">Chat Note</span>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="p-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Write a note about this conversation…"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-none"
            autoFocus
          />
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg px-3 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected]           = useState(null);
  const [messages, setMessages]           = useState([]);
  const [lead, setLead]                   = useState(null);
  const [conv, setConv]                   = useState(null);
  const [chatLabel, setChatLabel]         = useState(null);
  const [chatNote, setChatNote]           = useState('');
  const [reply, setReply]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [labelFilter, setLabelFilter]     = useState('all'); // 'all' | label key
  const [showNote, setShowNote]           = useState(false);
  const bottomRef                         = useRef(null);
  const listPollRef                       = useRef(null);
  const msgPollRef                        = useRef(null);
  const textareaRef                       = useRef(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await inboxAPI.getAll();
      setConversations(res.data.data);
    } catch {
      // silent background poll
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (phone, bizId, silent = false) => {
    if (!silent) setLoadingMsgs(true);
    try {
      const res = await inboxAPI.getMessages(phone, bizId);
      setMessages(res.data.data.messages);
      setLead(res.data.data.lead);
      setConv(res.data.data.conv);
      setChatLabel(res.data.data.chatLabel?.label || null);
      setChatNote(res.data.data.chatLabel?.note || '');
    } catch {
      if (!silent) toast.error('Failed to load messages');
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    listPollRef.current = setInterval(fetchConversations, 8000);
    return () => clearInterval(listPollRef.current);
  }, [fetchConversations]);

  useEffect(() => {
    clearInterval(msgPollRef.current);
    if (!selected) return;
    fetchMessages(selected.customerPhone, selected.businessId);
    msgPollRef.current = setInterval(
      () => fetchMessages(selected.customerPhone, selected.businessId, true),
      5000
    );
    return () => clearInterval(msgPollRef.current);
  }, [selected, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelect = (c) => {
    setSelected({ customerPhone: c.customerPhone, businessId: c.businessId });
    setMessages([]);
    setLead(null);
    setConv(null);
    setChatLabel(c.chatLabel);
    setChatNote(c.chatNote);
  };

  const handleLabelChange = async (newLabel) => {
    const val = newLabel === chatLabel ? null : newLabel; // toggle off if same
    try {
      await inboxAPI.updateLabel(selected.customerPhone, {
        businessId: selected.businessId,
        label: val,
      });
      setChatLabel(val);
      // Update in list too
      setConversations((prev) => prev.map((c) =>
        c.customerPhone === selected.customerPhone && c.businessId === selected.businessId
          ? { ...c, chatLabel: val }
          : c
      ));
    } catch {
      toast.error('Failed to update label');
    }
  };

  const handleSend = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      await inboxAPI.sendReply(selected.customerPhone, {
        text: reply.trim(),
        businessId: selected.businessId,
      });
      setReply('');
      // Auto-set label to active if null/closed
      if (!chatLabel || chatLabel === 'closed') {
        setChatLabel('active');
        setConversations((prev) => prev.map((c) =>
          c.customerPhone === selected.customerPhone && c.businessId === selected.businessId
            ? { ...c, chatLabel: 'active' }
            : c
        ));
      }
      await fetchMessages(selected.customerPhone, selected.businessId, true);
    } catch {
      toast.error('Failed to send — customer must message first (24h window)');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const displayName = (c) => c.lead?.name || c.customerPhone;

  const filteredConversations = labelFilter === 'all'
    ? conversations
    : labelFilter === 'none'
      ? conversations.filter((c) => !c.chatLabel)
      : conversations.filter((c) => c.chatLabel === labelFilter);

  return (
    <AdminLayout title="WhatsApp Inbox">
      {showNote && selected && (
        <NoteModal
          phone={selected.customerPhone}
          businessId={selected.businessId}
          currentNote={chatNote}
          onClose={() => setShowNote(false)}
          onSaved={(note) => {
            setChatNote(note);
            setConversations((prev) => prev.map((c) =>
              c.customerPhone === selected.customerPhone && c.businessId === selected.businessId
                ? { ...c, chatNote: note }
                : c
            ));
          }}
        />
      )}

      <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* ── Left: Conversation list ── */}
        <div className={`w-full md:w-80 border-r border-gray-100 flex flex-col flex-shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
          {/* Header + label filter */}
          <div className="border-b border-gray-100">
            <div className="px-4 py-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-600" />
              <span className="font-semibold text-sm text-gray-900">Conversations</span>
              <span className="ml-auto text-xs text-gray-400">{filteredConversations.length}</span>
              <button onClick={fetchConversations} className="text-gray-400 hover:text-gray-600 p-1">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Label filter tabs */}
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {[{ key: 'all', label: 'All' }, { key: 'none', label: 'Unlabelled' }, ...CHAT_LABELS].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setLabelFilter(f.key)}
                  className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                    labelFilter === f.key
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Loading...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3 px-6 text-center">
                <MessageSquare className="w-10 h-10" />
                <p className="text-sm">
                  {labelFilter === 'all'
                    ? 'No conversations yet.'
                    : `No ${labelFilter === 'none' ? 'unlabelled' : labelMap[labelFilter]?.label} conversations.`}
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const active = selected?.customerPhone === c.customerPhone && selected?.businessId === c.businessId;
                return (
                  <button
                    key={`${c.customerPhone}:${c.businessId}`}
                    onClick={() => handleSelect(c)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors
                      ${active ? 'bg-green-50 border-l-2 border-l-green-500' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 mt-0.5
                        ${c.chatLabel === 'follow_up' ? 'bg-orange-100 text-orange-700'
                          : c.chatLabel === 'active'  ? 'bg-green-100 text-green-700'
                          : c.chatLabel === 'closed'  ? 'bg-gray-100 text-gray-500'
                          : c.chatLabel === 'no_response' ? 'bg-red-100 text-red-600'
                          : 'bg-green-100 text-green-700'}`}>
                        {displayName(c)[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm text-gray-900 truncate">{displayName(c)}</span>
                          <span className="ml-auto text-xs text-gray-400 shrink-0 pl-1">{fmtConvDate(c.lastMessageAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {c.lastDirection === 'outbound' && <span className="text-gray-400">↗ </span>}
                          {c.lastMessage?.replace(/\n/g, ' ').slice(0, 50)}
                        </p>
                        {/* Note preview */}
                        {c.chatNote && (
                          <p className="text-xs text-purple-400 truncate mt-0.5 italic">📝 {c.chatNote}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${BIZ_BADGE[c.businessId] || 'bg-gray-100 text-gray-500'}`}>
                            {c.businessId}
                          </span>
                          {c.chatLabel && <LabelBadge labelKey={c.chatLabel} small />}
                          {c.botStep && c.botStep !== 'COMPLETED' && !c.chatLabel && (
                            <span className="text-xs text-orange-500 truncate">• {STEP_LABEL[c.botStep] || c.botStep}</span>
                          )}
                          {c.lead?.stage === 'booked' && (
                            <span className="text-xs text-green-600">• Booked ✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right: Chat view ── */}
        {selected ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-white">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="md:hidden text-gray-400 hover:text-gray-600">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm shrink-0">
                  {(lead?.name || selected.customerPhone)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-900">
                    {lead?.name || selected.customerPhone}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Phone className="w-3 h-3" />{selected.customerPhone}
                    </span>
                    {conv?.step && conv.step !== 'COMPLETED' && (
                      <span className="text-xs text-orange-500">• {STEP_LABEL[conv.step] || conv.step}</span>
                    )}
                    {lead?.stage && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STAGE_BADGE[lead.stage] || ''}`}>
                        {lead.stage}
                      </span>
                    )}
                    {lead?.serviceInterest && (
                      <span className="text-xs text-gray-400 truncate">🧹 {lead.serviceInterest}</span>
                    )}
                  </div>
                </div>
                {/* Note button */}
                <button
                  onClick={() => setShowNote(true)}
                  title="Add / edit note"
                  className={`p-1.5 rounded-lg transition-colors ${chatNote ? 'text-purple-500 bg-purple-50 hover:bg-purple-100' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                >
                  <StickyNote className="w-4 h-4" />
                </button>
              </div>

              {/* Note preview under header */}
              {chatNote && (
                <div className="mt-2 ml-12 text-xs text-purple-500 italic bg-purple-50 rounded-lg px-2 py-1">
                  📝 {chatNote}
                </div>
              )}

              {/* Label selector */}
              <div className="mt-2 ml-12 flex items-center gap-1.5 flex-wrap">
                <Tag className="w-3 h-3 text-gray-300" />
                {CHAT_LABELS.map((lbl) => (
                  <button
                    key={lbl.key}
                    onClick={() => handleLabelChange(lbl.key)}
                    className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all border ${
                      chatLabel === lbl.key
                        ? `${lbl.color} border-transparent shadow-sm`
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {lbl.label}
                  </button>
                ))}
                {chatLabel && (
                  <button
                    onClick={() => handleLabelChange(chatLabel)}
                    className="text-xs text-gray-300 hover:text-gray-500 px-1"
                    title="Remove label"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: '#f0f2f5' }}>
              {loadingMsgs ? (
                <div className="text-center text-gray-400 text-sm py-12">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  No messages stored yet.<br />
                  <span className="text-xs">Messages appear here when customers message SofaShine.</span>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOut   = msg.direction === 'outbound';
                  const isAdmin = msg.sentBy === 'admin';
                  return (
                    <div key={msg._id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      {!isOut && (
                        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 shrink-0 mr-1.5 mt-1 self-end">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className={`max-w-[72%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words shadow-sm
                        ${isOut
                          ? isAdmin
                            ? 'bg-blue-500 text-white rounded-br-none'
                            : 'bg-green-500 text-white rounded-br-none'
                          : 'bg-white text-gray-900 rounded-bl-none'
                        }`}
                      >
                        {isAdmin && <div className="text-blue-200 text-xs font-semibold mb-0.5">Admin</div>}
                        {msg.text}
                        <div className={`text-xs mt-1 text-right ${isOut ? 'text-white/60' : 'text-gray-400'}`}>
                          {fmtTime(msg.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="px-4 py-3 border-t border-gray-100 flex items-end gap-2 bg-white">
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                rows={1}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300 resize-none"
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />
              <button
                onClick={handleSend}
                disabled={sending || !reply.trim()}
                className="w-10 h-10 bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-3 text-gray-300">
            <MessageSquare className="w-14 h-14" />
            <p className="text-sm">Select a conversation to view messages</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
