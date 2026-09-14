"use client";

import { SectionCard } from "@/components/app-ui";

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Support</h1>
        <p className="mt-1 text-sm text-soft">Get help with Danyal QBot.</p>
      </div>

      <SectionCard title="Quick Help" description="Common questions and answers">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-white">How do I start the bot?</p>
            <p className="mt-1 text-xs leading-relaxed text-soft">
              Go to the QBot page and click &ldquo;Start Bot&rdquo;. The bot will begin
              analyzing the market and placing trades automatically.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">What is demo mode?</p>
            <p className="mt-1 text-xs leading-relaxed text-soft">
              Demo mode uses virtual money so you can test the bot risk-free. Switch to
              live mode in settings once you&apos;re confident in the strategy.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">My license is about to expire</p>
            <p className="mt-1 text-xs leading-relaxed text-soft">
              You&apos;ll receive a notification when your license is expiring soon. Contact
              support to renew your subscription before it expires.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">I can&apos;t connect my Quotex account</p>
            <p className="mt-1 text-xs leading-relaxed text-soft">
              Make sure you&apos;re logged into Quotex in your browser and that the session
              cookies are valid. Try logging out and back in to Quotex if issues persist.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Contact Support" description="Need more help? Reach out to us.">
        <div className="space-y-3">
          <p className="text-xs text-soft">
            For technical support, account issues, or billing questions, contact us at:
          </p>
          <a
            href="mailto:support@danyalqbot.com"
            className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            support@danyalqbot.com
          </a>
        </div>
      </SectionCard>
    </div>
  );
}