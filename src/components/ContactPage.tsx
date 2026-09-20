import React from 'react';
import { ClipboardList, ArrowLeft, Mail, Clock } from 'lucide-react';

interface ContactPageProps {
  onBack: () => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans">
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-indigo-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white">
              <ClipboardList size={24} />
            </div>
            <span className="text-xl font-black tracking-tight">AuditionEase</span>
          </button>
          <button onClick={onBack} className="flex items-center gap-2 text-[#4F46E5] hover:underline text-sm font-medium">
            <ArrowLeft size={16} />
            Back to Home
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pt-32 pb-20">
        <h1 className="text-4xl font-black mb-2">Contact Us</h1>
        <p className="text-gray-400 mb-12">We're here to help. Reach out to us with any questions or concerns.</p>

        <div className="space-y-8 text-[#374151] leading-relaxed">
          <section className="bg-[#F9FAFB] rounded-2xl p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white flex-shrink-0">
                <Mail size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Email Support</h2>
                <p>For general inquiries, account issues, billing questions, or technical support, email us at:</p>
                <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline font-semibold text-lg mt-2 inline-block">support@auditionease.com</a>
              </div>
            </div>
          </section>

          <section className="bg-[#F9FAFB] rounded-2xl p-8">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white flex-shrink-0">
                <Clock size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Response Time</h2>
                <p>We aim to respond to all inquiries within 1–2 business days. For urgent billing or account issues, please include "URGENT" in your subject line.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-4">Common Topics</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-[#E5E7EB] rounded-xl p-5">
                <h3 className="font-semibold text-[#1A1A1A] mb-2">Account & Login</h3>
                <p className="text-sm">Issues with login, email verification, password resets, or account settings.</p>
              </div>
              <div className="border border-[#E5E7EB] rounded-xl p-5">
                <h3 className="font-semibold text-[#1A1A1A] mb-2">Billing & Subscriptions</h3>
                <p className="text-sm">Questions about charges, plan changes, cancellations, or refund requests.</p>
              </div>
              <div className="border border-[#E5E7EB] rounded-xl p-5">
                <h3 className="font-semibold text-[#1A1A1A] mb-2">Audition Management</h3>
                <p className="text-sm">Help with creating auditions, inviting applicants, scheduling, or evaluations.</p>
              </div>
              <div className="border border-[#E5E7EB] rounded-xl p-5">
                <h3 className="font-semibold text-[#1A1A1A] mb-2">Bug Reports</h3>
                <p className="text-sm">Found something that doesn't work as expected? Let us know and we'll fix it.</p>
              </div>
            </div>
          </section>

        </div>
      </main>

      <footer className="py-12 px-6 border-t border-indigo-100 bg-white">
        <div className="max-w-3xl mx-auto text-center text-gray-400 text-sm">
          © {new Date().getFullYear()} AuditionEase. All rights reserved.
        </div>
      </footer>
    </div>
  );
};
