import {isAbsolute,join} from 'node:path';
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function makeLaunchAgent({projectRoot,nodePath,intervalSeconds=3600}) {
 if(!isAbsolute(projectRoot||'')||!isAbsolute(nodePath||'')||!Number.isInteger(intervalSeconds)||intervalSeconds<900)throw new Error('Invalid launch agent settings');
 const script=join(projectRoot,'incremental/scheduled.mjs'),log=join(projectRoot,'.cache/incremental/scheduled.log');
 return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>dev.terryso.trailertube.incremental</string>\n<key>ProgramArguments</key><array><string>${xml(nodePath)}</string><string>--max-old-space-size=4096</string><string>${xml(script)}</string></array>\n<key>WorkingDirectory</key><string>${xml(projectRoot)}</string>\n<key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>\n<key>StartInterval</key><integer>${intervalSeconds}</integer>\n<key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string>\n</dict></plist>\n`;
}
