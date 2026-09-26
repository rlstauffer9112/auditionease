import React from 'react';
import { ClipboardList, ArrowLeft } from 'lucide-react';

interface PrivacyPageProps {
  onBack: () => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans">
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-indigo-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-3">
          <button onClick={onBack} className="flex items-center gap-2 sm:gap-3 min-w-0 hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white">
              <ClipboardList size={24} />
            </div>
            <span className="text-lg sm:text-xl font-black tracking-tight">AuditionEase</span>
          </button>
          <button onClick={onBack} className="shrink-0 py-2 flex items-center gap-2 text-[#4F46E5] hover:underline text-sm font-medium">
            <ArrowLeft size={16} />
            Back to Home
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 pt-24 sm:pt-32 pb-16 sm:pb-20">
        <h1 className="text-3xl sm:text-4xl font-black mb-2">Privacy Policy</h1>
        <p className="text-gray-400 mb-8 sm:mb-12">Last updated: September 19, 2026</p>

        <div className="space-y-8 text-[#374151] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">1. Introduction</h2>
            <p>AuditionEase ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our audition management platform ("Service"). Please read this policy carefully. By using the Service, you consent to the practices described in this policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">2. Information We Collect</h2>
            <h3 className="font-semibold text-[#1A1A1A] mt-4 mb-2">Personal Information</h3>
            <p>When you register for an account or use our Service, we may collect:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Name (first and last)</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Payment and billing information (processed securely through Stripe)</li>
              <li>Audition-related data you provide (evaluations, notes, scheduling information)</li>
            </ul>

            <h3 className="font-semibold text-[#1A1A1A] mt-4 mb-2">Automatically Collected Information</h3>
            <p>When you access the Service, we may automatically collect:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>IP address</li>
              <li>Browser type and version</li>
              <li>Device information</li>
              <li>Usage data (pages visited, features used, time spent)</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Provide, operate, and maintain the Service</li>
              <li>Process transactions and manage your subscription</li>
              <li>Send you account-related communications (verification emails, billing notices)</li>
              <li>Respond to your inquiries and provide customer support</li>
              <li>Improve and personalize your experience</li>
              <li>Monitor and analyze usage patterns and trends</li>
              <li>Protect against fraud and unauthorized access</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">4. Payment Processing</h2>
            <p>All payment information is processed securely by our third-party payment processor, <strong>Stripe</strong>. We do not store your full credit card number, CVV, or other sensitive payment details on our servers. Stripe's privacy policy and security practices govern the handling of your payment data. For more information, visit <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#4F46E5] hover:underline">Stripe's Privacy Policy</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">5. Information Sharing and Disclosure</h2>
            <p>We do not sell your personal information. We may share your information in the following circumstances:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li><strong>Service Providers:</strong> We share information with third-party vendors who assist us in operating the Service (e.g., Stripe for payments, Brevo for transactional emails, hosting providers).</li>
              <li><strong>Audition Organizers:</strong> If you sign up as an applicant for an audition, your provided information (name, email, phone, and any custom fields) will be visible to the audition organizer.</li>
              <li><strong>Legal Requirements:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities.</li>
              <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of the transaction.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">6. Data Retention</h2>
            <p>We retain your personal information for as long as your account is active or as needed to provide the Service. If you delete your account, we will delete or anonymize your personal information within 30 days, except where we are required to retain it for legal or legitimate business purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">7. Data Security</h2>
            <p>We implement appropriate technical and organizational security measures to protect your information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">8. Cookies</h2>
            <p>We use cookies and similar technologies to maintain your session, remember your preferences, and understand how you interact with our Service. You can control cookies through your browser settings, but disabling them may affect your ability to use certain features of the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">9. Your Rights</h2>
            <p>Depending on your location, you may have the following rights regarding your personal information:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Data Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Opt out of marketing communications at any time</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, please contact us at <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline">support@auditionease.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">10. Children's Privacy</h2>
            <p>The Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we learn that we have collected personal information from a child under 13, we will take steps to delete such information promptly.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">11. Third-Party Links</h2>
            <p>The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review the privacy policies of any third-party sites you visit.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">12. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. Your continued use of the Service after any changes constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">13. Contact Us</h2>
            <p>If you have any questions or concerns about this Privacy Policy, please contact us at <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline">support@auditionease.com</a>.</p>
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
