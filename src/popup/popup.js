/**
 * popup/popup.js
 * ==============
 * Thin orchestrator: wires DOM elements to feature modules.
 */

import { initDepotFlow }    from './depotFlow.js';
import { initGmailFlow }    from './gmailFlow.js';
import { getContact }       from '../config/config.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const depotStatusDot    = document.getElementById('depotStatusDot');
const depotStatusLabel  = document.getElementById('depotStatusLabel');
const depotMessage      = document.getElementById('depotMessage');
const dryRunToggle      = document.getElementById('dryRun');
const scanCADBtn        = document.getElementById('scanCAD');
const scanDriveBtn      = document.getElementById('scanDrive');
const retryRescheduleBtn = document.getElementById('retryReschedule');
const scanProgress      = document.getElementById('scanProgress');
const progressFill      = document.getElementById('progressFill');
const progressLabel     = document.getElementById('progressLabel');
const depotLogEl        = document.getElementById('depotLog');

const gmailStatusDot    = document.getElementById('gmailStatusDot');
const gmailStatusLabel  = document.getElementById('gmailStatusLabel');
const gmailMessage      = document.getElementById('gmailMessage');
const checkLabelBtn     = document.getElementById('checkLabel');

// ── Feature modules ───────────────────────────────────────────────────────────

initDepotFlow({
  depotStatusDot, depotStatusLabel, depotMessage,
  dryRunToggle, scanCADBtn, scanDriveBtn, retryRescheduleBtn,
  scanProgress, progressFill, progressLabel, depotLogEl,
});

initGmailFlow({
  gmailStatusDot, gmailStatusLabel, gmailMessage, checkLabelBtn,
});

// ── Footer: author details, kept in the gitignored local config ───────────────

const contact = getContact();
document.getElementById('footerBrand').textContent = contact.brand;

const footerEmail = document.getElementById('footerEmail');
footerEmail.textContent = contact.email;
footerEmail.href = `mailto:${contact.email}`;

const footerPhone = document.getElementById('footerPhone');
footerPhone.textContent = contact.phone;
footerPhone.href = `tel:${contact.phone.replace(/\s/g, '')}`;

// ── Accordion: one section open at a time ─────────────────────────────────────

document.querySelectorAll('details.section').forEach(detail => {
  detail.querySelector('.section__header').addEventListener('click', (e) => {
    e.preventDefault();
    const isOpen = detail.open;
    document.querySelectorAll('details.section').forEach(d => { d.open = false; });
    if (!isOpen) detail.open = true;
  });
});
