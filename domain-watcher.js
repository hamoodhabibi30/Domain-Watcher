import fetch from "node-fetch";
import cron from "node-cron";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const DOMAINS = [
  "https://vegamovies.bot",
  "https://hdhub4u.football",
  "https://extramovies.pages"
];

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function sendAlert(domain, msg) {
  const mailOptions = {
    from: `Domain Watchdog <${process.env.EMAIL_USER}>`,
    to: process.env.ALERT_EMAIL,
    subject: `ALERT: ${domain} Status Changed`,
    text: msg
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error("Email error:", err);
    else console.log("Alert sent:", info.response);
  });
}

async function checkDomains() {
  for (let url of DOMAINS) {
    try {
      const res = await fetch(url, { redirect: "manual" });

      if (res.status >= 300 && res.status < 400) {
        const redirectTo = res.headers.get("location");
        sendAlert(url, `Redirect detected!\n${url} redirects to ${redirectTo}`);
        continue;
      }

      if (!res.ok) {
        sendAlert(url, `Site down or inaccessible. Status code: ${res.status}`);
      } else {
        console.log(`[${new Date()}] ${url} is up.`);
      }

    } catch (err) {
      sendAlert(url, `Error fetching ${url}:\n${err.message}`);
    }
  }
}

// Run every 15 mins
cron.schedule("*/15 * * * *", checkDomains);
