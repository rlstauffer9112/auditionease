import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mail, Loader2, CheckCircle, ArrowRight, Mic2 } from 'lucide-react';

interface CustomAttribute {
  id: number;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  options: string;
  required: boolean;
  order: number;
}

interface AuditionInfo {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  status: string;
}

interface InvitePageProps {
  inviteCode: string;
}

type Step = 'loading' | 'email' | 'verify' | 'form' | 'success' | 'error';

export const InvitePage: React.FC<InvitePageProps> = ({ inviteCode }) => {
  const [step, setStep] = useState<Step>('loading');
  const [audition, setAudition] = useState<AuditionInfo | null>(null);
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailToken, setEmailToken] = useState('');

  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  const [existingPerformerId, setExistingPerformerId] = useState<number | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [customData, setCustomData] = useState<Record<string, any>>({});
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${inviteCode}`)
      .then(async res => {
        if (!res.ok) throw new Error((await res.json()).error || 'Not found');
        return res.json();
      })
      .then(data => {
        setAudition(data.audition);
        setCustomAttributes(data.customAttributes.sort((a: CustomAttribute, b: CustomAttribute) => a.order - b.order));
        setStep('email');
      })
      .catch(err => {
        setErrorMsg(err.message || 'Audition not found');
        setStep('error');
      });
  }, [inviteCode]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/invite/${inviteCode}/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmailToken(data.token);
      setStep('verify');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/invite/${inviteCode}/confirm-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: emailToken, verifyCode, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.performer) {
        setExistingPerformerId(data.performer.id);
        setFirstName(data.performer.firstName);
        setLastName(data.performer.lastName);
        setPhone(data.performer.phone || '');
        if (data.performer.customFieldValues) {
          const cd: Record<string, any> = {};
          for (const cfv of data.performer.customFieldValues) {
            const attr = customAttributes.find(a => a.id === cfv.customAttributeId);
            if (!attr) continue;
            if (attr.type === 'boolean') cd[attr.label] = cfv.value === 'true';
            else if (attr.type === 'multiselect') {
              try { cd[attr.label] = JSON.parse(cfv.value); } catch { cd[attr.label] = []; }
            } else cd[attr.label] = cfv.value;
          }
          setCustomData(cd);
        }
      }
      setStep('form');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setErrorMsg('');
    try {
      const customFieldValues = customAttributes
        .filter(attr => customData[attr.label] !== undefined && customData[attr.label] !== '' && customData[attr.label] !== null)
        .map(attr => ({
          customAttributeId: attr.id,
          value: (attr.type === 'multiselect' || attr.type === 'boolean') ? JSON.stringify(customData[attr.label]) : String(customData[attr.label]),
        }));

      const res = await fetch(`/api/invite/${inviteCode}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName, lastName, phone, customFieldValues }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const renderCustomField = (attr: CustomAttribute) => {
    const options = attr.options ? attr.options.split(',').map(o => o.trim()).filter(Boolean) : [];
    const value = customData[attr.label];

    switch (attr.type) {
      case 'text':
        return (
          <input type="text" value={value || ''} onChange={e => setCustomData({ ...customData, [attr.label]: e.target.value })}
            required={attr.required}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
          />
        );
      case 'number':
        return (
          <input type="number" value={value || ''} onChange={e => setCustomData({ ...customData, [attr.label]: e.target.value })}
            required={attr.required}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
          />
        );
      case 'date':
        return (
          <input type="date" value={value || ''} onChange={e => setCustomData({ ...customData, [attr.label]: e.target.value })}
            required={attr.required}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
          />
        );
      case 'boolean':
        return (
          <select value={value === true ? 'true' : value === false ? 'false' : ''} onChange={e => setCustomData({ ...customData, [attr.label]: e.target.value === 'true' })}
            required={attr.required}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
          >
            <option value="">Select...</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );
      case 'select':
        return (
          <select value={value || ''} onChange={e => setCustomData({ ...customData, [attr.label]: e.target.value })}
            required={attr.required}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
          >
            <option value="">Select...</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'multiselect': {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={selected.includes(opt)}
                  onChange={e => {
                    const next = e.target.checked ? [...selected, opt] : selected.filter(s => s !== opt);
                    setCustomData({ ...customData, [attr.label]: next });
                  }}
                  className="w-4 h-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]"
                />
                <span className="text-sm font-medium text-[#374151]">{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center border border-[#E5E7EB]"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">!</span>
          </div>
          <h2 className="text-2xl font-bold mb-4">Audition Not Found</h2>
          <p className="text-gray-600">{errorMsg || 'This invite link is invalid or the audition no longer exists.'}</p>
        </motion.div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center border border-[#E5E7EB]"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-4">You're all set!</h2>
          <p className="text-gray-600 leading-relaxed">
            Your information has been submitted for <strong>{audition?.title}</strong>.
            {existingPerformerId ? ' Your profile has been updated.' : ' You have been registered as a new vocalist.'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="max-w-lg w-full bg-white rounded-3xl p-8 shadow-xl border border-[#E5E7EB]"
      >
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-indigo-100">
            <Mic2 size={24} />
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-1">{audition?.title}</h1>
          {audition?.description && <p className="text-gray-500 text-sm">{audition.description}</p>}
          {audition?.date && (
            <p className="text-xs text-gray-400 mt-2 font-medium">
              {new Date(audition.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {audition.location ? ` • ${audition.location}` : ''}
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
            {errorMsg}
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleSendCode} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#4F46E5] focus:bg-white outline-none transition-all font-medium"
                  placeholder="your@email.com"
                />
              </div>
              <p className="text-xs text-gray-400 ml-1">We'll send a verification code to confirm your identity.</p>
            </div>
            <button type="submit" disabled={emailLoading}
              className="w-full bg-[#4F46E5] text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:bg-[#4338CA] transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
            >
              {emailLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Verification Code <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <div className="text-center mb-2">
              <p className="text-sm text-gray-500">We sent a 6-digit code to <strong>{email}</strong></p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Verification Code</label>
              <input type="text" required value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6} inputMode="numeric" autoFocus
                className="w-full px-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-[#4F46E5] focus:bg-white outline-none transition-all font-mono text-center text-2xl tracking-[0.5em]"
                placeholder="000000"
              />
            </div>
            <button type="submit" disabled={verifyLoading || verifyCode.length !== 6}
              className="w-full bg-[#4F46E5] text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:bg-[#4338CA] transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
            >
              {verifyLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Verify <ArrowRight className="w-5 h-5" /></>}
            </button>
            <button type="button" onClick={() => { setStep('email'); setVerifyCode(''); setErrorMsg(''); }}
              className="w-full text-sm font-bold text-gray-400 hover:text-[#4F46E5] transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {existingPerformerId && (
              <div className="p-3 bg-[#EEF2FF] text-[#4F46E5] rounded-xl text-sm font-medium text-center">
                Welcome back! Your information has been pre-filled. Review and update as needed.
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">First Name</label>
                <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Last Name</label>
                <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-[#374151] mb-1.5">Email</label>
              <input type="email" value={email} disabled
                className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#374151] mb-1.5">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                placeholder="Optional"
              />
            </div>

            {customAttributes.length > 0 && (
              <div className="pt-4 border-t border-[#E5E7EB]">
                <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-3">Vocal Attributes</p>
                <div className="space-y-4">
                  {customAttributes.map(attr => (
                    <div key={attr.id}>
                      <label className="block text-sm font-bold text-[#374151] mb-1.5">
                        {attr.label}
                        {attr.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderCustomField(attr)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
                {errorMsg}
              </div>
            )}

            <button type="submit" disabled={submitLoading}
              className="w-full bg-[#4F46E5] text-white rounded-2xl py-4 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 hover:bg-[#4338CA] transition-all disabled:opacity-50 shadow-lg shadow-indigo-100 mt-6"
            >
              {submitLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Submit <ArrowRight className="w-5 h-5" /></>}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
};
