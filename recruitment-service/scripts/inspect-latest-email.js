const tls = require('tls');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

const socket = tls.connect(993, 'imap.gmail.com', { rejectUnauthorized: false }, () => {
  console.log('[IMAP] Connected to Gmail');
});

let step = 0;
let buffer = '';

socket.on('data', (d) => {
  buffer += d.toString();
  if (step === 0 && buffer.includes('* OK')) {
    step = 1;
    buffer = '';
    socket.write(`a001 LOGIN ${user} ${pass}\r\n`);
  } else if (step === 1 && buffer.includes('a001 OK')) {
    step = 2;
    buffer = '';
    socket.write(`a002 SELECT INBOX\r\n`);
  } else if (step === 2 && buffer.includes('a002 OK')) {
    step = 3;
    buffer = '';
    socket.write(`a003 SEARCH SUBJECT "Activate Your NEXNUV"\r\n`);
  } else if (step === 3 && buffer.includes('a003 OK')) {
    const match = buffer.match(/\* SEARCH ([\d\s]+)/);
    const ids = match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
    console.log('[IMAP] Found message IDs:', ids);
    if (ids.length > 0) {
      step = 4;
      buffer = '';
      socket.write(`a004 FETCH ${ids[ids.length - 1]} (BODY[TEXT])\r\n`);
    } else {
      socket.write(`a005 LOGOUT\r\n`);
    }
  } else if (step === 4 && buffer.includes('a004 OK')) {
    console.log('\n--- LATEST EMAIL CONTENT START ---');
    console.log(buffer.slice(0, 1500));
    console.log('--- LATEST EMAIL CONTENT END ---\n');
    socket.write(`a005 LOGOUT\r\n`);
  } else if (buffer.includes('a005 OK')) {
    socket.end();
    process.exit(0);
  }
});

socket.on('error', (err) => {
  console.error('[IMAP Error]:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('[Timeout]');
  socket.end();
  process.exit(0);
}, 15000);

