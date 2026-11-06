import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

async function main(): Promise<void> {
  const account = await nodemailer.createTestAccount();

  const envPath = path.resolve(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found in backend directory');
  }

  let content = fs.readFileSync(envPath, 'utf8');

  const settings: Record<string, string> = {
    SENDER_COUNT: '1',
    SENDER_1_NAME: 'Ethereal Sandbox',
    SENDER_1_EMAIL: account.user,
    SENDER_1_SMTP_HOST: account.smtp.host,
    SENDER_1_SMTP_PORT: String(account.smtp.port),
    SENDER_1_SMTP_SECURE: String(account.smtp.secure),
    SENDER_1_SMTP_USER: account.user,
    SENDER_1_SMTP_PASS: account.pass,
    USE_ETHEREAL_FALLBACK: 'false',
  };

  for (const [key, value] of Object.entries(settings)) {
    const regex = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');

    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');

  console.log('Ethereal account created and .env updated successfully!');
  console.log('SMTP host:', account.smtp.host);
  console.log('SMTP port:', account.smtp.port);
  console.log('Credentials saved privately in backend/.env');
}

main().catch((error) => {
  console.error('Could not create Ethereal account:', error.message);
  process.exit(1);
});