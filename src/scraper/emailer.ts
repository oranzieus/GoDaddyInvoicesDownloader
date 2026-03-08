import { execFileSync } from 'child_process';
import type { DateRange } from '../shared/types';

export function sendInvoiceEmail(
  pdfPaths: string[],
  dateRange: DateRange,
  recipients: string[]
): void {
  if (recipients.length === 0) {
    throw new Error('No email recipients configured');
  }
  if (pdfPaths.length === 0) {
    throw new Error('No PDF files to attach');
  }

  const to = recipients.join('; ');
  const startDate = dateRange.startDate || 'N/A';
  const endDate = dateRange.endDate || 'N/A';
  const subject = `GoDaddy Invoices (${startDate} to ${endDate})`;
  const body = `These are the GoDaddy invoices from ${startDate} to ${endDate}.`;

  // Build attachment lines
  const attachLines = pdfPaths
    .map((p) => `$mail.Attachments.Add("${p.replace(/\\/g, '\\\\')}") | Out-Null`)
    .join('\n');

  const psScript = `
$ol = New-Object -ComObject Outlook.Application
$mail = $ol.CreateItem(0)
$mail.To = "${to}"
$mail.Subject = "${subject}"
$mail.Body = "${body}"
${attachLines}
$mail.Send()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($ol) | Out-Null
`.trim();

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  console.log(`[emailer] Sending email to: ${to}`);
  console.log(`[emailer] Attaching ${pdfPaths.length} PDF(s)`);

  execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
    timeout: 30000,
    stdio: 'ignore',
  });

  console.log('[emailer] Email sent successfully');
}

export function sendTestEmail(recipients: string[]): void {
  if (recipients.length === 0) {
    throw new Error('No email recipients configured');
  }

  const to = recipients.join('; ');

  const psScript = `
$ol = New-Object -ComObject Outlook.Application
$mail = $ol.CreateItem(0)
$mail.To = "${to}"
$mail.Subject = "GDInvoices - Test Email"
$mail.Body = "This is a test email from GDInvoices. If you received this, email sending is configured correctly."
$mail.Send()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($ol) | Out-Null
`.trim();

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], {
    timeout: 30000,
    stdio: 'ignore',
  });
}
