/**
 * popup/settingsFlow.js
 * =====================
 * Handles Settings persistence and the Drive folder browser.
 */

import { getAuthToken } from '../auth/getAuthToken.js';

export function initSettingsFlow({
  geminiKeyInput, driveFolderInput, browseDriveBtn, driveFolderPicker, saveSettingsBtn,
  onBrowseError,
}) {
  // Save immediately as the user types — prevents data loss when the popup
  // closes on tab switch before the Save button is pressed.
  geminiKeyInput.addEventListener('input', () =>
    chrome.storage.local.set({ geminiApiKey: geminiKeyInput.value.trim() })
  );
  driveFolderInput.addEventListener('input', () =>
    chrome.storage.local.set({ driveFolderId: driveFolderInput.value.trim() })
  );

  // Save button — gives visual confirmation that values are stored.
  saveSettingsBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      geminiApiKey:  geminiKeyInput.value.trim(),
      driveFolderId: driveFolderInput.value.trim(),
    });
    saveSettingsBtn.textContent = 'Saved ✓';
    saveSettingsBtn.classList.add('btn--saved');
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Save';
      saveSettingsBtn.classList.remove('btn--saved');
    }, 2000);
  });

  // Drive folder browser
  browseDriveBtn.addEventListener('click', async () => {
    browseDriveBtn.disabled = true;
    browseDriveBtn.textContent = '⏳';
    driveFolderPicker.hidden = true;

    try {
      const token = await getAuthToken();
      const q = `mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Drive ${res.status}`);
      const { files } = await res.json();

      driveFolderPicker.innerHTML = '';
      if (!files?.length) {
        const opt = document.createElement('option');
        opt.textContent = 'No folders found';
        opt.disabled = true;
        driveFolderPicker.appendChild(opt);
      } else {
        files.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.id;
          opt.textContent = f.name;
          driveFolderPicker.appendChild(opt);
        });
      }
      driveFolderPicker.hidden = false;
    } catch (err) {
      onBrowseError?.(`Browse failed: ${err.message}`);
    } finally {
      browseDriveBtn.disabled = false;
      browseDriveBtn.textContent = '📁';
    }
  });

  driveFolderPicker.addEventListener('change', () => {
    const selected = driveFolderPicker.options[driveFolderPicker.selectedIndex];
    if (!selected) return;
    driveFolderInput.value = selected.value;
    driveFolderPicker.hidden = true;
    chrome.storage.local.set({ driveFolderId: selected.value });
  });
}
