/**
 * AutoBib - Premium Custom Dropdown
 * Converts native <select> elements into stylable JS dropdowns.
 */

class CustomDropdown {
  constructor(selectElement) {
    this.select = selectElement;
    this.options = Array.from(this.select.querySelectorAll('option, optgroup'));
    this.wrapper = null;
    this.selectedDisplay = null;
    this.dropdownList = null;
    
    this.init();
  }

  init() {
    // Hide native select
    this.select.style.display = 'none';
    
    // Create wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'custom-select-wrapper';
    if (this.select.classList.contains('select-sm')) {
      this.wrapper.classList.add('custom-select-sm');
    }
    
    // Insert wrapper after select
    this.select.parentNode.insertBefore(this.wrapper, this.select.nextSibling);
    
    // Create display
    this.selectedDisplay = document.createElement('div');
    this.selectedDisplay.className = 'custom-select-display';
    this.wrapper.appendChild(this.selectedDisplay);
    
    // Create dropdown list
    this.dropdownList = document.createElement('div');
    this.dropdownList.className = 'custom-select-list';
    this.wrapper.appendChild(this.dropdownList);
    
    this.renderOptions();
    this.updateDisplay();
    this.attachEvents();
  }

  renderOptions() {
    this.dropdownList.innerHTML = '';
    
    this.options.forEach(opt => {
      if (opt.tagName === 'OPTGROUP') {
        const groupLabel = document.createElement('div');
        groupLabel.className = 'custom-select-group-label';
        groupLabel.textContent = opt.getAttribute('label');
        this.dropdownList.appendChild(groupLabel);
        
        Array.from(opt.querySelectorAll('option')).forEach(childOpt => {
          this.dropdownList.appendChild(this.createOptionElement(childOpt));
        });
      } else {
        this.dropdownList.appendChild(this.createOptionElement(opt));
      }
    });
  }

  createOptionElement(opt) {
    const item = document.createElement('div');
    item.className = 'custom-select-option';
    item.textContent = opt.textContent;
    item.dataset.value = opt.value;
    
    if (this.select.value === opt.value) {
      item.classList.add('selected');
    }
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.select.value = opt.value;
      // Trigger native change event so other scripts know it changed
      this.select.dispatchEvent(new Event('change', { bubbles: true }));
      this.updateDisplay();
      this.close();
    });
    
    return item;
  }

  updateDisplay() {
    const selectedOpt = this.select.options[this.select.selectedIndex];
    if (selectedOpt) {
      this.selectedDisplay.innerHTML = `<span>${selectedOpt.textContent}</span>`;
      
      // Update selected class in list
      const items = this.dropdownList.querySelectorAll('.custom-select-option');
      items.forEach(item => {
        if (item.dataset.value === this.select.value) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
  }

  attachEvents() {
    this.selectedDisplay.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.wrapper.classList.contains('open');
      
      // Close all others
      document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
      
      if (!isOpen) {
        this.wrapper.classList.add('open');
      }
    });
    
    // Listen for external changes (like JS modifying the select value directly)
    this.select.addEventListener('change', () => {
      this.updateDisplay();
    });

    // Close when clicking outside
    document.addEventListener('click', () => {
      this.wrapper.classList.remove('open');
    });
  }
}

// Auto-init all selects with class "select" or "select-sm"
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('select.select, select.select-sm').forEach(sel => {
    new CustomDropdown(sel);
  });
  
  // Watch for dynamically added selects or options (optional, basic mutation observer)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList' && mutation.target.tagName === 'SELECT') {
        // Re-render if options changed
        const wrapper = mutation.target.nextElementSibling;
        if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
           // Simplified: just update display for now, a full re-init is better for full dynamic content
           // But since options are dynamically added in refs-group-filter, we should re-init.
           wrapper.remove();
           new CustomDropdown(mutation.target);
        }
      }
    });
  });
  
  document.querySelectorAll('select.select, select.select-sm').forEach(sel => {
    observer.observe(sel, { childList: true });
  });
});
