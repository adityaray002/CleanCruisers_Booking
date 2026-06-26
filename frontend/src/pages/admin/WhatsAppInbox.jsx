import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MessageSquare, Send, Phone, RefreshCw, ChevronLeft, User } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { inboxAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const BIZ_BADGE = {
  sofashine:    'bg-blue-100 text-blue-700',
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
  AWAITING_SERVICE:       'Selecting service',
  AWAITING_SUBSERVICE:    'Selecting sub-service',
  AWAITING_CUSTOM_REQUEST:'Custom request',
  AWAITING_ADD_MORE:      'Adding more',
  AWAITING_DATE:          'Choosing date',
  AWAITING_TIME:          'Choosing time',
  AWAITING_ADDRESS:       'Entering address',
  AWAITING_NAME:          'Entering name',
  AWAITING_CONFIRM:       'Confirming booking',
  COMPLETED:              'Done ✓',
};

const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const fmtConvDate = (d) => {
  const date  = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return fmtTime(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export default function WhatsAppInbox() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected]           = useState(null); // { customerPhone, businessId }
  const [messages, setMessages]           = useState([]);
  const [lead, setLead]                   = useState(null);
  const [conv, setConv]                   = useState(null);
  const [reply, setReply]                 = useState('');
  const [sending, setSending]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
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
    } catch {
      if (!silent) toast.error('Failed to load messages');
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // Poll conversations list every 8s
  useEffect(() => {
    fetchConversations();
    listPollRef.current = setInterval(fetchConversations, 8000);
    return () => clearInterval(listPollRef.current);
  }, [fetchConversations]);

  // Poll messages every 5s when a conversation is open
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

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelect = (c) => {
    setSelected({ customerPhone: c.customerPhone, businessId: c.businessId });
    setMessages([]);
    setLead(null);
    setConv(null);
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
      await fetchMessages(selected.customerPhone, selected.businessId, true);
    } catch {
      toast.error('Failed to send — check if customer is within 24h window');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = (c) => c.lead?.name || c.customerPhone;

  return (
    <AdminLayout title="WhatsApp Inbox">
      <div className="flex h-[calc(100vh-8rem)] bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

        {/* ── Left: Conversation list ── */}
        <div className={`w-full md:w-80 border-r border-gray-100 flex flex-col flex-shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-green-600" />
            <span className="font-semibold text-sm text-gray-900">Conversations</span>
            <span className="ml-auto text-xs text-gray-400">{conversations.length}</span>
            <button onClick={fetchConversations} className="text-gray-400 hover:text-gray-600 p-1">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-3 px-6 text-center">
                <MessageSquare className="w-10 h-10" />
                <p className="text-sm">No conversations yet. They'll appear here when customers message SofaShine.</p>
              </div>
            ) : (
              conversations.map((c) => {
                const active = selected?.customerPhone === c.customerPhone && selected?.businessId === c.businessId;
                return (
                  <button
                    key={`${c.customerPhone}:${c.businessId}`}
                    onClick={() => handleSelect(c)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors
                      ${active ? 'bg-green-50 border-l-2 border-l-green-500' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm shrink-0">
                        {displayName(c)[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-sm text-gray-900 truncate">{displayName(c)}</span>
                          <span className="ml-auto text-xs text-gray-400 shrink-0 pl-1">{fmtConvDate(c.lastMessageAt)}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {c.lastDirection === 'outbound' && <span className="text-gray-400">↗ </span>}
                          {c.lastMessage?.replace(/\n/g, ' ').slice(0, 55)}
                        </p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${BIZ_BADGE[c.businessId] || 'bg-gray-100 text-gray-500'}`}>
                            {c.businessId}
                          </span>
                          {c.botStep && c.botStep !== 'COMPLETED' && (
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
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-white">
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
                  {conv?.step && (
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
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: '#f0f2f5' }}>
              {loadingMsgs ? (
                <div className="text-center text-gray-400 text-sm py-12">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">
                  No messages stored yet. Messages will appear here after customers message SofaShine.
                </div>
              ) : (
                messages.map((msg) => {
                  const isOut = msg.direction === 'outbound';
                  const isAdmin = msg.sentBy === 'admin';
                  return (
                    <div key={msg._id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                      {!isOut && (
                        <div className="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0 mr-1.5 mt-1 self-end">
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
                        {isAdmin && (
                          <div className="text-blue-200 text-xs font-semibold mb-0.5">Admin</div>
                        )}
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
                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
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
