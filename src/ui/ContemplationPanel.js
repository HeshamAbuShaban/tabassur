/**
 * Contemplation Panel Controller
 * Manages the display of Quranic verses, tafsir, and scientific facts
 * Handles user reflections (local storage only)
 */

import { quranVerses, scientificFacts, contemplationStations } from '../data/content.js';

export class ContemplationPanel {
    constructor(options = {}) {
        this.visible = false;
        this.currentStation = null;
        this.currentJourney = 'afaq';
        
        // DOM elements
        this.panelElement = null;
        this.verseArabicElement = null;
        this.verseRefElement = null;
        this.tafsirElement = null;
        this.factElement = null;
        this.reflectionInput = null;
        
        // Reflection storage key
        this.storageKey = 'tabassur_reflections';
        
        this.init();
    }
    
    init() {
        // Load saved reflections on init
        this.loadReflections();
    }
    
    /**
     * Bind DOM elements
     */
    bindUI(panel, verseArabic, verseRef, tafsir, fact, reflectionInput) {
        this.panelElement = panel;
        this.verseArabicElement = verseArabic;
        this.verseRefElement = verseRef;
        this.tafsirElement = tafsir;
        this.factElement = fact;
        this.reflectionInput = reflectionInput;
        
        // Setup reflection input handler
        if (this.reflectionInput) {
            this.reflectionInput.addEventListener('blur', () => {
                this.saveCurrentReflection();
            });
        }
    }
    
    /**
     * Show the contemplation panel
     */
    show() {
        if (this.panelElement) {
            this.panelElement.classList.add('visible');
        }
        this.visible = true;
    }
    
    /**
     * Hide the contemplation panel
     */
    hide() {
        if (this.panelElement) {
            this.panelElement.classList.remove('visible');
        }
        this.visible = false;
    }
    
    /**
     * Toggle panel visibility
     */
    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
        return this.visible;
    }
    
    /**
     * Set content for a specific station
     */
    setStation(stationKey, journey = 'afaq') {
        this.currentJourney = journey;
        this.currentStation = stationKey;
        
        const stations = contemplationStations[journey];
        if (!stations || !stations[stationKey]) {
            console.warn(`Station ${stationKey} not found in journey ${journey}`);
            return;
        }
        
        const station = stations[stationKey];
        const verseData = quranVerses[station.verseKey];
        const factData = scientificFacts[station.factKey];
        
        if (verseData) {
            this.setVerse(verseData.verse, verseData.reference);
            this.setTafsir(verseData.tafsir, verseData.source);
        }
        
        if (factData) {
            this.setFact(factData.fact, factData.source);
        }
        
        // Load saved reflection for this station
        this.loadReflection(stationKey);
        
        this.show();
    }
    
    /**
     * Set Quranic verse display
     */
    setVerse(arabicText, reference) {
        if (this.verseArabicElement) {
            this.verseArabicElement.textContent = arabicText;
        }
        if (this.verseRefElement) {
            this.verseRefElement.textContent = reference;
        }
    }
    
    /**
     * Set tafsir excerpt
     */
    setTafsir(text, source) {
        if (this.tafsirElement) {
            this.tafsirElement.textContent = text;
        }
    }
    
    /**
     * Set scientific fact
     */
    setFact(text, source) {
        if (this.factElement) {
            this.factElement.innerHTML = `
                <span>${text}</span>
                <br><small style="opacity: 0.6; margin-top: 4px;">المصدر: ${source}</small>
            `;
        }
    }
    
    /**
     * Save current reflection to local storage
     */
    saveCurrentReflection() {
        if (!this.reflectionInput || !this.currentStation) return;
        
        const text = this.reflectionInput.value.trim();
        if (!text) return;
        
        const reflections = this.loadReflections();
        const key = `${this.currentJourney}_${this.currentStation}`;
        
        reflections[key] = {
            text: text,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem(this.storageKey, JSON.stringify(reflections));
        console.log('Reflection saved locally');
    }
    
    /**
     * Load reflection for a specific station
     */
    loadReflection(stationKey) {
        if (!this.reflectionInput) return;
        
        const reflections = this.loadReflections();
        const key = `${this.currentJourney}_${stationKey}`;
        
        if (reflections[key]) {
            this.reflectionInput.value = reflections[key].text;
        } else {
            this.reflectionInput.value = '';
        }
    }
    
    /**
     * Load all reflections from local storage
     */
    loadReflections() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn('Could not load reflections:', e);
            return {};
        }
    }
    
    /**
     * Clear all reflections (user-initiated)
     */
    clearAllReflections() {
        if (confirm('هل أنت متأكد من حذف جميع تأملاتك؟')) {
            localStorage.removeItem(this.storageKey);
            if (this.reflectionInput) {
                this.reflectionInput.value = '';
            }
            console.log('All reflections cleared');
        }
    }
    
    /**
     * Export reflections as JSON (for backup)
     */
    exportReflections() {
        const reflections = this.loadReflections();
        const dataStr = JSON.stringify(reflections, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabassur_reflections_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}

export default ContemplationPanel;
