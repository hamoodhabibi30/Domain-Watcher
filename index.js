const axios = require('axios');
const notifier = require('node-notifier');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Domains to monitor
let domains = [
    'vegamovies.bot',
    'extramovies.page',
    'hdhub4u.football'
];

// File to store previous states and domain mappings
const stateFile = path.join(__dirname, 'domain-states.json');
const domainMappingsFile = path.join(__dirname, 'domain-mappings.json');

// Enable JSON parsing
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// API endpoint to get current status
app.get('/api/status', async (req, res) => {
    try {
        const states = await loadPreviousStates();
        const status = {
            timestamp: new Date().toISOString(),
            domains: {}
        };

        for (const domain of domains) {
            const state = states[domain];
            status.domains[domain] = {
                isLive: state?.isLive || false,
                status: state?.status || 'unknown',
                currentDomain: state?.currentDomain || domain,
                lastChecked: state?.timestamp || 'never'
            };
        }

        res.json(status);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
    }
});

// API endpoint to get domain mappings
app.get('/api/mappings', async (req, res) => {
    try {
        const mappings = await loadDomainMappings();
        res.json(mappings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get domain mappings' });
    }
});

// Function to load domain mappings
async function loadDomainMappings() {
    try {
        const data = await fs.readFile(domainMappingsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Function to save domain mappings
async function saveDomainMappings(mappings) {
    await fs.writeFile(domainMappingsFile, JSON.stringify(mappings, null, 2));
}

// Function to extract domain from URL
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (error) {
        return url;
    }
}

// Function to check domain status
async function checkDomain(domain) {
    try {
        const response = await axios.get(`https://${domain}`, {
            timeout: 5000,
            validateStatus: function (status) {
                return status >= 200 && status < 500;
            },
            maxRedirects: 5,
            validateStatus: null
        });

        // Check for redirects
        const finalUrl = response.request.res.responseUrl;
        const finalDomain = extractDomain(finalUrl);

        return {
            status: response.status,
            isLive: true,
            originalDomain: domain,
            currentDomain: finalDomain,
            redirectUrl: finalUrl,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'error',
            isLive: false,
            originalDomain: domain,
            currentDomain: domain,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Function to load previous states
async function loadPreviousStates() {
    try {
        const data = await fs.readFile(stateFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

// Function to save states
async function saveStates(states) {
    await fs.writeFile(stateFile, JSON.stringify(states, null, 2));
}

// Function to update domains list
async function updateDomainsList(newDomain, originalDomain) {
    if (!domains.includes(newDomain)) {
        domains.push(newDomain);
        console.log(`\nNew domain detected: ${newDomain} (redirected from ${originalDomain})`);
        
        // Update domain mappings
        const mappings = await loadDomainMappings();
        mappings[originalDomain] = newDomain;
        await saveDomainMappings(mappings);
        
        return true;
    }
    return false;
}

// Function to compare states and notify if changed
async function compareAndNotify(domain, oldState, newState) {
    if (!oldState) {
        console.log(`Initial check for ${domain}:`, JSON.stringify(newState, null, 2));
        return true;
    }

    const hasChanged = JSON.stringify(oldState) !== JSON.stringify(newState);
    
    if (hasChanged) {
        const changeInfo = {
            domain: domain,
            previousState: oldState,
            newState: newState,
            timestamp: new Date().toISOString()
        };
        
        console.log('\nDomain Change Detected:');
        console.log(JSON.stringify(changeInfo, null, 2));
        
        // Check for domain changes
        if (newState.currentDomain !== newState.originalDomain) {
            await updateDomainsList(newState.currentDomain, newState.originalDomain);
        }
        
        // Only show desktop notifications in development
        if (process.env.NODE_ENV !== 'production') {
            notifier.notify({
                title: 'Domain Change Detected',
                message: `Changes detected for ${domain}`,
                sound: true,
                wait: true
            });
        }
    }
    
    return hasChanged;
}

// Function to display current status
function displayStatus(states) {
    const status = {
        timestamp: new Date().toISOString(),
        domains: {}
    };

    for (const domain of domains) {
        const state = states[domain];
        status.domains[domain] = {
            isLive: state?.isLive || false,
            status: state?.status || 'unknown',
            currentDomain: state?.currentDomain || domain,
            lastChecked: state?.timestamp || 'never'
        };
    }

    console.log('\nCurrent Domain Status:');
    console.log(JSON.stringify(status, null, 2));
}

// Main monitoring function
async function monitorDomains() {
    console.log('Starting domain monitoring...');
    
    while (true) {
        const previousStates = await loadPreviousStates();
        const newStates = {};
        
        for (const domain of domains) {
            console.log(`\nChecking ${domain}...`);
            const newState = await checkDomain(domain);
            newStates[domain] = newState;
            
            await compareAndNotify(domain, previousStates[domain], newState);
        }
        
        await saveStates(newStates);
        displayStatus(newStates);
        
        // Wait for 5 minutes before next check
        console.log('\nWaiting 5 minutes before next check...');
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
}

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    // Start monitoring in the background
    monitorDomains().catch(error => {
        console.error('Error in monitoring:', error);
        process.exit(1);
    });
}); 
