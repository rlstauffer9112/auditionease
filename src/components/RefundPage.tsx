import React from 'react';
import { ClipboardList, ArrowLeft } from 'lucide-react';

interface RefundPageProps {
  onBack: () => void;
}

export const RefundPage: React.FC<RefundPageProps> = ({ onBack }) => {
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
        <h1 className="text-4xl font-black mb-2">Refund & Cancellation Policy</h1>
        <p className="text-gray-400 mb-12">Last updated: September 19, 2026</p>

        <div className="space-y-8 text-[#374151] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">1. Overview</h2>
            <p>This Refund & Cancellation Policy outlines how subscriptions, cancellations, and refunds are handled for the AuditionEase platform ("Service"). By subscribing to a paid plan, you agree to the terms described below.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">2. Subscription Plans</h2>
            <p>AuditionEase offers both free and paid subscription plans. Paid plans are billed on a recurring basis (monthly or annually) and provide access to premium features as described on our pricing page. All payments are securely processed through Stripe.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">3. Cancellation</h2>
            <p>You may cancel your subscription at any time through the Settings page in your account. Upon cancellation:</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Your subscription will remain active until the end of the current billing period.</li>
              <li>You will continue to have access to paid features until the billing period ends.</li>
              <li>Your account will not be deleted — it will revert to the free tier.</li>
              <li>No further charges will be made after cancellation takes effect.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">4. Refund Policy</h2>
            <p>We want you to be satisfied with AuditionEase. Our refund policy is as follows:</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li><strong>Within 7 days of initial purchase:</strong> If you are not satisfied with your subscription, you may request a full refund within 7 days of your first payment. Contact us at <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline">support@auditionease.com</a> to request a refund.</li>
              <li><strong>After 7 days:</strong> Refunds are not available for the current billing period. You may cancel your subscription to prevent future charges.</li>
              <li><strong>Annual plans:</strong> For annual subscriptions, refund requests within the first 7 days of the billing cycle will receive a full refund. After 7 days, no partial refunds will be issued for the remainder of the annual term.</li>
              <li><strong>Billing errors:</strong> If you believe you have been charged in error, please contact us within 30 days of the charge. We will investigate and issue a refund if appropriate.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">5. How to Request a Refund</h2>
            <p>To request a refund, please email us at <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline">support@auditionease.com</a> with the following information:</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Your account email address</li>
              <li>The date of the charge</li>
              <li>The reason for your refund request</li>
            </ul>
            <p className="mt-3">We will review your request and respond within 5 business days. Approved refunds will be processed to your original payment method within 5–10 business days.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">6. Free Trial</h2>
            <p>If your subscription began with a free trial, you will not be charged during the trial period. If you cancel before the trial ends, no payment will be collected. If you do not cancel before the trial ends, your subscription will automatically convert to the paid plan and you will be charged accordingly.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">7. Downgrades</h2>
            <p>If you downgrade from a higher-tier plan to a lower-tier plan, the change will take effect at the start of your next billing cycle. You will retain access to the higher-tier features until the current billing period ends. No refunds or credits are issued for downgrades.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">8. Account Termination</h2>
            <p>If we terminate your account due to a violation of our Terms of Service, you will not be eligible for a refund. We reserve the right to suspend or terminate accounts that violate our terms at any time.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">9. Changes to This Policy</h2>
            <p>We may update this policy from time to time. Material changes will be communicated via email or through the Service. Your continued use of the Service after changes are posted constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">10. Contact Us</h2>
            <p>If you have any questions about our refund or cancellation policy, please contact us at <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline">support@auditionease.com</a>.</p>
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
