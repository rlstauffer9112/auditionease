import React from 'react';
import { ClipboardList, ArrowLeft } from 'lucide-react';

interface TermsPageProps {
  onBack: () => void;
}

export const TermsPage: React.FC<TermsPageProps> = ({ onBack }) => {
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
        <h1 className="text-4xl font-black mb-2">Terms of Service</h1>
        <p className="text-gray-400 mb-12">Last updated: September 19, 2026</p>

        <div className="space-y-8 text-[#374151] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">1. Agreement to Terms</h2>
            <p>By accessing or using AuditionEase ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use the Service. These Terms apply to all visitors, users, and others who access the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">2. Description of Service</h2>
            <p>AuditionEase is an audition management platform that enables organizations and individuals to create, manage, and evaluate auditions. The Service includes features for scheduling, applicant management, evaluation, and related tools provided through our web application.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">3. Account Registration</h2>
            <p>To use certain features of the Service, you must register for an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete. You are responsible for safeguarding your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">4. Subscriptions and Billing</h2>
            <p>Some features of the Service require a paid subscription. By subscribing to a paid plan, you agree to pay the applicable fees as described at the time of purchase. Subscription fees are billed in advance on a recurring basis (monthly or annually, depending on your selected plan). All payments are processed securely through Stripe, our third-party payment processor.</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li><strong>Automatic Renewal:</strong> Your subscription will automatically renew at the end of each billing cycle unless you cancel before the renewal date.</li>
              <li><strong>Price Changes:</strong> We reserve the right to change subscription fees upon reasonable notice. Continued use of the Service after a price change constitutes acceptance of the new fees.</li>
              <li><strong>Taxes:</strong> Fees are exclusive of applicable taxes, which will be added where required by law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">5. Free Trial</h2>
            <p>We may offer a free trial period for certain subscription plans. At the end of the free trial, your subscription will automatically convert to a paid plan unless you cancel before the trial expires. You will not be charged during the trial period.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">6. Cancellation and Refunds</h2>
            <p>You may cancel your subscription at any time through your account settings. Upon cancellation, your subscription will remain active until the end of the current billing period. We do not provide prorated refunds for partial billing periods. If you believe you have been charged in error, please contact us within 30 days of the charge.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">7. Acceptable Use</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>Violate any applicable law or regulation</li>
              <li>Infringe upon the rights of others</li>
              <li>Upload or transmit viruses, malware, or other harmful content</li>
              <li>Attempt to gain unauthorized access to other accounts, systems, or networks</li>
              <li>Use the Service for any fraudulent or deceptive purpose</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Collect or harvest user information without consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">8. Intellectual Property</h2>
            <p>The Service and its original content (excluding content provided by users), features, and functionality are owned by AuditionEase and are protected by copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or create derivative works based on our Service without express written consent.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">9. User Content</h2>
            <p>You retain ownership of any content you submit, post, or display on or through the Service ("User Content"). By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, and display such content solely for the purpose of operating and providing the Service. You are solely responsible for the accuracy and legality of your User Content.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">10. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, AuditionEase shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your access to or use of the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">11. Disclaimer of Warranties</h2>
            <p>The Service is provided on an "as is" and "as available" basis without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, secure, or error-free.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">12. Termination</h2>
            <p>We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including if you breach these Terms. Upon termination, your right to use the Service will immediately cease. All provisions of these Terms that by their nature should survive termination shall survive.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">13. Changes to Terms</h2>
            <p>We reserve the right to modify or replace these Terms at any time. If a revision is material, we will provide at least 30 days' notice prior to any new terms taking effect. Your continued use of the Service after the effective date of the revised Terms constitutes acceptance of the changes.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">14. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-3">15. Contact Us</h2>
            <p>If you have any questions about these Terms, please contact us at <a href="mailto:support@auditionease.com" className="text-[#4F46E5] hover:underline">support@auditionease.com</a>.</p>
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
