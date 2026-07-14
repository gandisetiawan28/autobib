const SkillsManager = (() => {
    const els = {
        btnOpen: document.getElementById('btn-skills'),
        modal: document.getElementById('skills-modal'),
        btnClose: document.getElementById('btn-close-skills-modal'),
        list: document.getElementById('skills-list'),
        form: document.getElementById('skills-form'),
        btnNew: document.getElementById('btn-new-skill'),
        btnCancel: document.getElementById('btn-cancel-skill'),
        inputId: document.getElementById('skill-id'),
        inputName: document.getElementById('skill-name'),
        inputDesc: document.getElementById('skill-desc'),
        inputPrompt: document.getElementById('skill-prompt'),
        inputActive: document.getElementById('skill-active')
    };

    let skills = [];

    async function loadSkills() {
        try {
            const res = await ApiClient.skills.list();
            if (res.success) {
                skills = res.skills;
                renderList();
            }
        } catch (e) {
            console.error('Gagal memuat skills', e);
        }
    }

    function renderList() {
        if (!els.list) return;
        els.list.innerHTML = '';
        if (skills.length === 0) {
            els.list.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);">Belum ada skill yang dibuat.</div>';
            return;
        }

        skills.forEach(skill => {
            const item = document.createElement('div');
            item.className = 'skill-item';
            item.style.cssText = 'border: 1px solid var(--border); padding: 12px; border-radius: 8px; margin-bottom: 8px; background: var(--bg-surface);';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div style="font-weight:600; font-size:14px; margin-bottom:4px; display:flex; align-items:center; gap:8px;">
                            ${skill.name}
                            <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${skill.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color:${skill.is_active ? '#22c55e' : '#ef4444'};">
                                ${skill.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                        </div>
                        <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">${skill.description || '-'}</div>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button class="btn btn-sm btn-ghost btn-edit" data-id="${skill.id}">✏️</button>
                        <button class="btn btn-sm btn-ghost btn-delete" data-id="${skill.id}" style="color:var(--color-danger)">🗑️</button>
                    </div>
                </div>
                <div style="font-size:11px; font-family:monospace; background:var(--bg-elevated); padding:8px; border-radius:4px; max-height:80px; overflow-y:auto; color:var(--text-primary); border:1px solid var(--border);">
                    ${skill.prompt_injection.replace(/\n/g, '<br/>')}
                </div>
            `;
            els.list.appendChild(item);
        });

        // Attach events
        els.list.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                editSkill(id);
            });
        });
        els.list.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Yakin ingin menghapus skill ini?')) {
                    try {
                        await ApiClient.skills.remove(id);
                        await loadSkills();
                    } catch (err) {
                        alert('Gagal menghapus');
                    }
                }
            });
        });
    }

    function showForm(isEdit = false) {
        els.list.style.display = 'none';
        els.btnNew.style.display = 'none';
        els.form.style.display = 'flex';
        if (!isEdit) {
            els.inputId.value = '';
            els.inputName.value = '';
            els.inputDesc.value = '';
            els.inputPrompt.value = '';
            els.inputActive.checked = true;
        }
    }

    function hideForm() {
        els.form.style.display = 'none';
        els.list.style.display = 'block';
        els.btnNew.style.display = 'block';
    }

    function editSkill(id) {
        const skill = skills.find(s => s.id === id);
        if (!skill) return;
        els.inputId.value = skill.id;
        els.inputName.value = skill.name;
        els.inputDesc.value = skill.description;
        els.inputPrompt.value = skill.prompt_injection;
        els.inputActive.checked = skill.is_active;
        showForm(true);
    }

    function init() {
        if (!els.btnOpen) return;

        els.btnOpen.addEventListener('click', () => {
            els.modal.classList.remove('hidden');
            loadSkills();
            hideForm();
        });

        els.btnClose.addEventListener('click', () => {
            els.modal.classList.add('hidden');
        });

        els.btnNew.addEventListener('click', () => showForm(false));
        els.btnCancel.addEventListener('click', hideForm);

        els.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = els.inputId.value;
            const data = {
                name: els.inputName.value.trim(),
                description: els.inputDesc.value.trim(),
                prompt_injection: els.inputPrompt.value.trim(),
                is_active: els.inputActive.checked
            };

            if (!data.name || !data.prompt_injection) {
                alert('Nama dan Instruksi wajib diisi');
                return;
            }

            try {
                if (id) {
                    await ApiClient.skills.update(id, data);
                } else {
                    await ApiClient.skills.add(data);
                }
                hideForm();
                await loadSkills();
            } catch (err) {
                alert('Gagal menyimpan skill: ' + err.message);
            }
        });
    }

    return { init, loadSkills };
})();

document.addEventListener('DOMContentLoaded', SkillsManager.init);
