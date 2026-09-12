/**
 * Logarithmic Time Controller
 * Handles time navigation from Planck time (10^-43 s) to heat death (10^100 years)
 * Maps logarithmic slider values to scientific events and visual states
 */

import { timeKeyframes, quranVerses, scientificFacts } from '../data/content.js';

export class TimeController {
    constructor(options = {}) {
        this.minLogTime = -43;  // Planck time: 10^-43 seconds
        this.maxLogTime = 100;  // Heat death: 10^100 years
        this.currentLogTime = 10.14;  // Present day (log10 of age in seconds)
        
        // Callbacks
        this.onTimeChange = null;
        this.onEventTrigger = null;
        
        // State
        this.isPlaying = false;
        this.playSpeed = 1.0;
        this.lastEventIndex = -1;
        
        // DOM elements (set by UI controller)
        this.sliderElement = null;
        this.valueElement = null;
        this.ticksContainer = null;
        
        this.init();
    }
    
    init() {
        this.createTimeTicks();
    }
    
    /**
     * Create tick marks on the time slider
     */
    createTimeTicks() {
        if (!this.ticksContainer) return;
        
        this.ticksContainer.innerHTML = '';
        
        // Add ticks for key events
        timeKeyframes.forEach(keyframe => {
            const normalizedPosition = this.logTimeToNormalized(keyframe.logTime);
            
            const tick = document.createElement('div');
            tick.className = 'tick';
            tick.style.left = `${normalizedPosition * 100}%`;
            
            // Only show labels for major events
            if (keyframe.logTime % 10 === 0 || keyframe.logTime === 10.14) {
                const label = document.createElement('div');
                label.className = 'tick-label';
                label.textContent = keyframe.name;
                tick.appendChild(label);
            }
            
            this.ticksContainer.appendChild(tick);
        });
    }
    
    /**
     * Convert logarithmic time to normalized position (0-1)
     */
    logTimeToNormalized(logTime) {
        return (logTime - this.minLogTime) / (this.maxLogTime - this.minLogTime);
    }
    
    /**
     * Convert normalized position to logarithmic time
     */
    normalizedToLogTime(normalized) {
        return this.minLogTime + normalized * (this.maxLogTime - this.minLogTime);
    }
    
    /**
     * Convert logarithmic time to actual seconds
     */
    logTimeToSeconds(logTime) {
        return Math.pow(10, logTime);
    }
    
    /**
     * Convert seconds to human-readable format
     */
    secondsToHumanReadable(seconds) {
        if (seconds < 1e-6) {
            return `${seconds.toExponential(2)} ثانية`;
        } else if (seconds < 60) {
            return `${seconds.toFixed(2)} ثانية`;
        } else if (seconds < 3600) {
            return `${(seconds / 60).toFixed(2)} دقيقة`;
        } else if (seconds < 86400) {
            return `${(seconds / 3600).toFixed(2)} ساعة`;
        } else if (seconds < 3.154e7) {
            return `${(seconds / 86400).toFixed(2)} يوم`;
        } else if (seconds < 3.154e9) {
            return `${(seconds / 3.154e7).toFixed(2)} سنة`;
        } else if (seconds < 3.154e12) {
            return `${(seconds / 3.154e9).toFixed(2)} ألف سنة`;
        } else if (seconds < 3.154e15) {
            return `${(seconds / 3.154e12).toFixed(2)} مليون سنة`;
        } else if (seconds < 3.154e18) {
            return `${(seconds / 3.154e15).toFixed(2)} مليار سنة`;
        } else {
            return `${seconds.toExponential(2)} سنة`;
        }
    }
    
    /**
     * Get the current event based on time
     */
    getCurrentEvent() {
        let currentEvent = null;
        
        for (let i = 0; i < timeKeyframes.length; i++) {
            const keyframe = timeKeyframes[i];
            if (this.currentLogTime >= keyframe.logTime) {
                currentEvent = keyframe;
                this.lastEventIndex = i;
            } else {
                break;
            }
        }
        
        return currentEvent;
    }
    
    /**
     * Set the current time from slider value
     */
    setTimeFromSlider(normalizedValue) {
        this.currentLogTime = this.normalizedToLogTime(normalizedValue);
        this.updateDisplay();
        
        // Check for event triggers
        const event = this.getCurrentEvent();
        if (event && this.onEventTrigger) {
            this.onEventTrigger(event);
        }
        
        if (this.onTimeChange) {
            this.onTimeChange(this.currentLogTime);
        }
    }
    
    /**
     * Update the display elements
     */
    updateDisplay() {
        if (this.valueElement) {
            const seconds = this.logTimeToSeconds(this.currentLogTime);
            const readable = this.secondsToHumanReadable(seconds);
            this.valueElement.textContent = readable;
        }
        
        if (this.sliderElement) {
            const normalized = this.logTimeToNormalized(this.currentLogTime);
            this.sliderElement.value = normalized;
        }
    }
    
    /**
     * Set time directly (for programmatic control)
     */
    setTime(logTime) {
        this.currentLogTime = Math.max(this.minLogTime, Math.min(this.maxLogTime, logTime));
        this.updateDisplay();
        
        if (this.onTimeChange) {
            this.onTimeChange(this.currentLogTime);
        }
    }
    
    /**
     * Play/pause time animation
     */
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        return this.isPlaying;
    }
    
    /**
     * Stop playback
     */
    stop() {
        this.isPlaying = false;
    }
    
    /**
     * Update animation
     */
    update(deltaTime) {
        if (!this.isPlaying) return;
        
        // Exponential time progression
        const timeDelta = deltaTime * this.playSpeed * 0.1;
        this.currentLogTime += timeDelta;
        
        if (this.currentLogTime >= this.maxLogTime) {
            this.currentLogTime = this.maxLogTime;
            this.isPlaying = false;
        }
        
        this.updateDisplay();
        
        if (this.onTimeChange) {
            this.onTimeChange(this.currentLogTime);
        }
    }
    
    /**
     * Get contemplation content for current time
     */
    getContemplationContent() {
        const event = this.getCurrentEvent();
        if (!event) return null;
        
        // Map event to appropriate verse and fact
        let verseKey, factKey;
        
        if (event.logTime < 0) {
            verseKey = 'cosmicWeb';
            factKey = 'cosmicWeb';
        } else if (event.logTime < 8) {
            verseKey = 'expansion';
            factKey = 'expansion';
        } else if (event.logTime < 10) {
            verseKey = 'stars';
            factKey = 'stars';
        } else if (event.logTime < 10.14) {
            verseKey = 'sevenHeavens';
            factKey = 'sevenHeavens';
        } else {
            verseKey = 'cosmicWeb';
            factKey = 'cosmicWeb';
        }
        
        return {
            verse: quranVerses[verseKey],
            fact: scientificFacts[factKey],
            event: event
        };
    }
    
    /**
     * Jump to a specific event
     */
    jumpToEvent(eventName) {
        const event = timeKeyframes.find(k => k.event === eventName || k.name === eventName);
        if (event) {
            this.setTime(event.logTime);
            return true;
        }
        return false;
    }
    
    /**
     * Bind UI elements
     */
    bindUI(sliderElement, valueElement, ticksContainer) {
        this.sliderElement = sliderElement;
        this.valueElement = valueElement;
        this.ticksContainer = ticksContainer;
        
        if (sliderElement) {
            sliderElement.addEventListener('input', (e) => {
                this.setTimeFromSlider(parseFloat(e.target.value));
            });
        }
        
        this.createTimeTicks();
        this.updateDisplay();
    }
}

export default TimeController;
