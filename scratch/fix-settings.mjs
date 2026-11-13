import fs from 'fs';

let content = fs.readFileSync('src/components/settings/SettingsPage.tsx', 'utf8');

// Pattern matching the inserted block
const pattern = /\s*\{\/\* ── Platform Support & Legal Information ─+ \*\/\}[\s\S]*?<\/Card>\s*\)\}/g;

// Strip all occurrences
content = content.replace(pattern, '');

// Insert exactly once before the sticky save bar
const singleBlock = `

      {/* ── Platform Support & Legal Information ─────────────────────── */}
      {activeAssetType === 'global' && (
        <Card className="border border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden mb-12">
          <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              Platform Support &amp; Legal
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              PayloadLogic platform support escalation channels and active legal agreements.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-3 text-xs text-slate-600">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
              <div>
                <span className="font-bold text-slate-800 block">Fleet Technical &amp; Dispatch Support</span>
                <span className="text-slate-500 text-[11px]">Direct dispatcher support for rate formulas, break-even CPM calculations, or account issues.</span>
              </div>
              <a
                href={\`mailto:\${SUPPORT_EMAIL}\`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-blue-600 hover:text-blue-700 font-semibold text-xs shadow-2xs hover:bg-slate-50 shrink-0"
              >
                <Mail className="h-3.5 w-3.5" />
                {SUPPORT_EMAIL}
              </a>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>PayloadLogic TMS &middot; All rights reserved</span>
              <div className="flex items-center gap-4">
                <Link href="/terms-of-service" target="_blank" className="hover:text-blue-600 underline">
                  Terms of Service
                </Link>
                <Link href="/privacy-policy" target="_blank" className="hover:text-blue-600 underline">
                  Privacy Policy
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sticky Bottom Save Bar`;

content = content.replace(/\s*\{\/\* ── Sticky Bottom Save Bar/, singleBlock);

fs.writeFileSync('src/components/settings/SettingsPage.tsx', content);
console.log('Successfully updated SettingsPage.tsx');
