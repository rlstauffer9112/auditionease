import React from 'react';
import { motion } from 'motion/react';
import {
  ClipboardList,
  Users,
  Calendar,
  Trophy,
  CheckCircle2,
  ArrowRight,
  SlidersHorizontal,
  Star,
  ShieldCheck,
  Zap
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  return (
    <div className="min-h-screen bg-[#E0E7FF] text-[#1A1A1A] font-sans selection:bg-[#4F46E5] selection:text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl border-b border-indigo-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white">
              <ClipboardList size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#1A1A1A]">AuditionEase</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-500">
            <a href="#features" className="hover:text-[#4F46E5] transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-[#4F46E5] transition-colors">How it Works</a>
            <a href="#pricing" className="hover:text-[#4F46E5] transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-[#4F46E5] transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGetStarted}
              className="text-[#4F46E5] px-5 py-2.5 rounded-full font-bold text-sm hover:bg-indigo-50 transition-all"
            >
              Log In
            </button>
            <button
              onClick={onGetStarted}
              className="bg-[#4F46E5] text-white px-6 py-2.5 rounded-full font-bold text-sm hover:bg-[#4338CA] transition-all active:scale-95 shadow-lg shadow-indigo-100"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section - Recipe 2 Style */}
      <section className="relative pt-40 pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#4F46E5]/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-[#4F46E5]/5 blur-[100px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="px-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-[#4F46E5] text-xs font-bold uppercase tracking-widest mb-12">
              <Star size={14} className="text-yellow-500" />
              The Future of Auditions is Here
            </div>

            <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase mb-8 leading-[0.9] text-[#1A1A1A]">
              Every<br />
              <span className="text-[#4F46E5]">Audition</span><br />
              Simplified
            </h1>

            <p className="max-w-2xl text-lg md:text-xl text-gray-600 mb-12 leading-relaxed">
              The all-in-one platform for directors, casting teams, and organizations.
              Streamline your audition workflow from open call to final placement.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-4">
              <button
                onClick={onGetStarted}
                className="w-full sm:w-auto bg-[#4F46E5] text-white px-10 py-5 rounded-2xl font-black text-lg hover:bg-[#4338CA] transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-indigo-500/20 flex items-center justify-center gap-3"
              >
                Create Free Account
                <ArrowRight size={24} />
              </button>
              <button className="w-full sm:w-auto px-10 py-5 rounded-2xl font-bold text-lg border border-indigo-100 hover:bg-indigo-50 transition-all">
                See Sample Audition
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid - Recipe 8 Style */}
      <section id="features" className="py-32 px-6 bg-white text-black">
        <div className="max-w-7xl mx-auto">
          <div className="mb-20">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase mb-6">
              Built for <br />
              <span className="text-[#4F46E5]">Modern Auditions</span>
            </h2>
            <p className="text-xl text-black/60 max-w-xl">
              Powerful tools designed to handle the complexity of auditions, evaluations, and placement decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: <Calendar className="text-[#4F46E5]" size={32} />,
                title: "Smart Scheduling",
                description: "Generate time slots instantly. Let applicants book their own times or assign them manually with ease."
              },
              {
                icon: <Users className="text-[#4F46E5]" size={32} />,
                title: "Applicant Directory",
                description: "Maintain a comprehensive database of applicants with profiles, history, and audition notes."
              },
              {
                icon: <Zap className="text-[#4F46E5]" size={32} />,
                title: "Live Evaluation",
                description: "Evaluate applicants on the fly with digital scorecards and customizable criteria."
              },
              {
                icon: <Trophy className="text-[#4F46E5]" size={32} />,
                title: "Placement Pipeline",
                description: "Seamlessly move applicants through rounds. Manage placements with a visual Kanban board."
              },
              {
                icon: <ShieldCheck className="text-[#4F46E5]" size={32} />,
                title: "Secure & Private",
                description: "Passwordless login and encrypted data ensure your organization's sensitive information stays protected."
              },
              {
                icon: <SlidersHorizontal className="text-[#4F46E5]" size={32} />,
                title: "Custom Attributes",
                description: "Collect exactly what you need. Define custom fields tailored to your audition requirements."
              }
            ].map((feature, i) => (
              <motion.div 
                key={i}
                whileHover={{ y: -10 }}
                className="p-8 rounded-3xl bg-[#F9FAFB] border border-[#E5E7EB] hover:shadow-2xl transition-all"
              >
                <div className="mb-6">{feature.icon}</div>
                <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                <p className="text-black/60 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works - Recipe 5 Style */}
      <section id="how-it-works" className="py-32 px-6 bg-[#E0E7FF]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase mb-12 text-[#1A1A1A]">
                Simple <br />
                <span className="text-[#4F46E5]">Process</span>
              </h2>
              <div className="space-y-12">
                {[
                  { step: "01", title: "Set Up Auditions", desc: "Define your requirements, audition dates, and location." },
                  { step: "02", title: "Invite Applicants", desc: "Share your audition link or manually add applicants to your directory." },
                  { step: "03", title: "Hold Your Auditions", desc: "Evaluate applicants in real-time with digital scorecards and instant feedback." },
                  { step: "04", title: "Make Your Selections", desc: "Review scores, compare applicants, and finalize placements with confidence." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-8">
                    <span className="text-5xl font-black text-[#4F46E5] opacity-20">{item.step}</span>
                    <div>
                      <h4 className="text-2xl font-bold mb-2 text-[#1A1A1A]">{item.title}</h4>
                      <p className="text-gray-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square bg-[#4F46E5]/5 rounded-full absolute -inset-10 blur-3xl" />
              <div className="relative bg-white border border-indigo-100 rounded-[40px] p-8 overflow-hidden shadow-2xl shadow-indigo-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="space-y-4">
                  <div className="h-8 w-1/2 bg-indigo-50 rounded-lg" />
                  <div className="h-32 w-full bg-indigo-50/50 rounded-2xl" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-24 bg-indigo-50/50 rounded-2xl" />
                    <div className="h-24 bg-indigo-50/50 rounded-2xl" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 px-6 bg-white relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-[#4F46E5]/5 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase mb-6 text-[#1A1A1A]">
              Simple <br />
              <span className="text-[#4F46E5]">Pricing</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-xl mx-auto">
              Choose the plan that fits your needs. No hidden fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="p-10 rounded-[40px] bg-[#E0E7FF] border border-indigo-100 flex flex-col shadow-sm"
            >
              <div className="mb-8">
                <h3 className="text-2xl font-bold mb-2 text-[#1A1A1A]">Free</h3>
                <p className="text-gray-400 text-sm uppercase tracking-widest font-bold">For Small Groups</p>
              </div>
              <div className="mb-8">
                <span className="text-5xl font-black text-[#1A1A1A]">$0</span>
                <span className="text-gray-400 ml-2">/month</span>
              </div>
              <ul className="space-y-4 mb-10 flex-grow">
                {[
                  "Up to 10 Applicants",
                  "Unlimited Auditions",
                  "Smart Scheduling",
                  "Basic Applicant Profiles",
                  "Email Support"
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-600">
                    <CheckCircle2 size={18} className="text-[#4F46E5]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button 
                onClick={onGetStarted}
                className="w-full py-4 rounded-2xl border border-indigo-100 font-bold hover:bg-indigo-50 transition-all text-[#4F46E5]"
              >
                Get Started
              </button>
            </motion.div>

            {/* Paid Plan */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="p-10 rounded-[40px] bg-[#4F46E5] border border-[#4F46E5] flex flex-col relative overflow-hidden shadow-2xl shadow-indigo-200"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-[40px] rounded-full -mr-16 -mt-16" />
              
              <div className="mb-8 relative z-10">
                <h3 className="text-2xl font-bold mb-2 text-white">Pro</h3>
                <p className="text-white/80 text-sm uppercase tracking-widest font-bold">For Professional Teams</p>
              </div>
              <div className="mb-8 relative z-10">
                <span className="text-5xl font-black text-white">$19.95</span>
                <span className="text-white/80 ml-2">/month</span>
              </div>
              <ul className="space-y-4 mb-10 flex-grow relative z-10">
                {[
                  "Unlimited Applicants",
                  "Unlimited Auditions",
                  "Advanced Placement Pipeline",
                  "Custom Attributes",
                  "Priority Support",
                  "Data Export"
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-white">
                    <CheckCircle2 size={18} className="text-white" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button 
                onClick={onGetStarted}
                className="w-full py-4 rounded-2xl bg-white text-[#4F46E5] font-bold hover:bg-white/90 transition-all shadow-xl relative z-10"
              >
                Go Pro Now
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-32 px-6 bg-[#E0E7FF] text-black border-t border-indigo-100">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase mb-6">
              Loved by <br />
              <span className="text-[#4F46E5]">Directors Everywhere</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                quote: "AuditionEase has completely changed how we handle our annual auditions. No more spreadsheets or missed emails.",
                author: "Sarah Jenkins",
                role: "Artistic Director, Metro Arts"
              },
              {
                quote: "The placement pipeline is a game-changer. I can see exactly where every applicant stands at any moment.",
                author: "David Chen",
                role: "Casting Director, City Theater"
              },
              {
                quote: "Applicants love the self-scheduling feature. It makes us look professional from the very first interaction.",
                author: "Elena Rodriguez",
                role: "Program Director, Dance Academy"
              }
            ].map((testimonial, i) => (
              <div key={i} className="p-10 rounded-[40px] bg-[#F3F4F6] border border-[#E5E7EB] relative">
                <div className="absolute top-10 right-10 text-[#4F46E5] opacity-10">
                  <ClipboardList size={64} />
                </div>
                <p className="text-xl font-medium mb-8 relative z-10 italic">"{testimonial.quote}"</p>
                <div>
                  <p className="font-bold text-lg">{testimonial.author}</p>
                  <p className="text-black/40 text-sm">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6">
        <div className="max-w-5xl mx-auto bg-[#4F46E5] rounded-[60px] p-12 md:p-24 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/20 blur-[80px] rounded-full -ml-32 -mb-32" />
          
          <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase mb-8 relative z-10">
            Ready to <br />Simplify Your Auditions?
          </h2>
          <p className="text-xl text-white/80 mb-12 max-w-xl mx-auto relative z-10">
            Join directors and organizations who have transformed their audition process with AuditionEase.
          </p>
          <button 
            onClick={onGetStarted}
            className="bg-white text-[#4F46E5] px-12 py-6 rounded-2xl font-black text-xl hover:bg-white/90 transition-all hover:scale-105 active:scale-95 relative z-10"
          >
            Get Started for Free
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-indigo-100 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#4F46E5] rounded-lg flex items-center justify-center text-white">
              <ClipboardList size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#1A1A1A]">AuditionEase</span>
          </div>
          <p className="text-gray-400 text-sm">
            © {new Date().getFullYear()} AuditionEase. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-[#4F46E5]">Privacy</a>
            <a href="#" className="hover:text-[#4F46E5]">Terms</a>
            <a href="#" className="hover:text-[#4F46E5]">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
