require('dotenv').config();
const nodemailer = require('nodemailer');
const dns = require('dns');
const net = require('net');

async function diagnose() {
  console.log('=== EMAIL CONFIG ===');
  console.log('EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
  console.log('EMAIL_USER:', process.env.EMAIL_USER);
  console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '***set (' + process.env.EMAIL_PASSWORD.length + ' chars)***' : 'NOT SET');
  console.log('');

  // DNS check
  console.log('=== DNS CHECK ===');
  try {
    const addresses = await new Promise((resolve, reject) => {
      dns.resolve('smtp.gmail.com', (err, addrs) => err ? reject(err) : resolve(addrs));
    });
    console.log('smtp.gmail.com resolves to:', addresses);
  } catch (e) {
    console.log('DNS failed:', e.message);
  }

  // TCP port 587 check
  console.log('\n=== TCP PORT 587 ===');
  try {
    await new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: 'smtp.gmail.com', port: 587, timeout: 5000 }, () => {
        console.log('TCP 587: CONNECTED');
        sock.destroy();
        resolve();
      });
      sock.on('error', (e) => { console.log('TCP 587 error:', e.message); reject(e); });
      sock.on('timeout', () => { console.log('TCP 587: TIMEOUT'); sock.destroy(); reject(new Error('timeout')); });
    });
  } catch (e) { /* handled above */ }

  // TCP port 465 check
  console.log('\n=== TCP PORT 465 ===');
  try {
    await new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: 'smtp.gmail.com', port: 465, timeout: 5000 }, () => {
        console.log('TCP 465: CONNECTED');
        sock.destroy();
        resolve();
      });
      sock.on('error', (e) => { console.log('TCP 465 error:', e.message); reject(e); });
      sock.on('timeout', () => { console.log('TCP 465: TIMEOUT'); sock.destroy(); reject(new Error('timeout')); });
    });
  } catch (e) { /* handled above */ }

  // Nodemailer verify
  console.log('\n=== NODEMAILER VERIFY (port 587) ===');
  try {
    const t1 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    const ok = await t1.verify();
    console.log('Port 587 verify:', ok);
  } catch (e) {
    console.log('Port 587 verify FAILED:', e.message);
  }

  console.log('\n=== NODEMAILER VERIFY (port 465) ===');
  try {
    const t2 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
    const ok = await t2.verify();
    console.log('Port 465 verify:', ok);
  } catch (e) {
    console.log('Port 465 verify FAILED:', e.message);
  }

  // Try send a test email
  console.log('\n=== SEND TEST EMAIL ===');
  try {
    const t = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });
    const info = await t.sendMail({
      from: '"TutorLink" <' + process.env.EMAIL_USER + '>',
      to: process.env.EMAIL_USER,
      subject: 'TutorLink Email Test',
      text: 'If you see this, email works!',
    });
    console.log('Email SENT! MessageId:', info.messageId);
  } catch (e) {
    console.log('Send FAILED:', e.message);
    console.log('Full error:', e.code, e.command);
  }

  console.log('\n=== DONE ===');
}

diagnose().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
