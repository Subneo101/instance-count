figma.showUI(__html__, { width: 400, height: 760 });

// Global variables to store scan results
var allScanResults = null;
var currentPageName = '';

function scanInstances() {
    try {
        var currentPage = figma.currentPage;
        currentPageName = currentPage.name;
        
        var instances = currentPage.findAll(function(node) {
            return node.type === 'INSTANCE' && node.mainComponent !== null;
        });
        
        var instanceCounts = {};
        
        instances.forEach(function(instance) {
            var mainComponent = instance.mainComponent;
            if (mainComponent) {
                var componentName = getComponentDisplayName(mainComponent);
                
                if (!instanceCounts[componentName]) {
                    instanceCounts[componentName] = { 
                        count: 0, 
                        hiddenCount: 0,
                        visibleCount: 0
                    };
                }
                
                instanceCounts[componentName].count++;
                
                if (!instance.visible) {
                    instanceCounts[componentName].hiddenCount++;
                } else {
                    instanceCounts[componentName].visibleCount++;
                }
            }
        });
        
        // Convert to array with full data
        var instanceArray = Object.keys(instanceCounts).map(function(name) {
            var data = instanceCounts[name];
            return { 
                name: name, 
                count: data.count,
                hiddenCount: data.hiddenCount,
                visibleCount: data.visibleCount,
                isDotted: name.charAt(0) === '.'
            };
        }).sort(function(a, b) { 
            return b.count - a.count; 
        });
        
        var totalInstances = instances.length;
        var totalHidden = instances.filter(function(instance) { 
            return !instance.visible; 
        }).length;
        
        allScanResults = {
            instances: instanceArray,
            totalInstances: totalInstances,
            totalHidden: totalHidden,
            pageName: currentPageName,
            timestamp: new Date().toISOString()
        };
        
        // Return filtered results based on current settings
        var filteredResults = filterResults(allScanResults, false, true);
        figma.ui.postMessage({
            type: 'scan-results',
            data: filteredResults
        });
        
    } catch (error) {
        figma.ui.postMessage({
            type: 'error',
            message: error.message
        });
    }
}

function filterResults(results, includeHidden, ignoreDotted) {
    if (!results) return null;
    
    var filteredInstances = results.instances.slice();
    
    // Filter out dotted components if ignoreDotted is true
    if (ignoreDotted) {
        filteredInstances = filteredInstances.filter(function(instance) { 
            return !instance.isDotted; 
        });
    }
    
    // If not including hidden, use only visible counts
    if (!includeHidden) {
        filteredInstances = filteredInstances.map(function(instance) {
            return {
                name: instance.name,
                count: instance.visibleCount,
                hiddenCount: 0,
                visibleCount: instance.visibleCount,
                isDotted: instance.isDotted
            };
        }).filter(function(instance) { 
            return instance.count > 0; 
        });
    }
    
    var totalInstances = filteredInstances.reduce(function(sum, instance) { 
        return sum + instance.count; 
    }, 0);
    var totalHidden = filteredInstances.reduce(function(sum, instance) { 
        return sum + instance.hiddenCount; 
    }, 0);
    
    return {
        instances: filteredInstances,
        totalInstances: totalInstances,
        totalHidden: totalHidden,
        pageName: results.pageName,
        timestamp: results.timestamp,
        includeHidden: includeHidden,
        ignoreDotted: ignoreDotted
    };
}

function getComponentDisplayName(mainComponent) {
    if (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
        return mainComponent.parent.name;
    }
    
    var name = mainComponent.name;
    
    if (name.indexOf('=') !== -1) {
        var parts = name.split(',');
        for (var i = 0; i < parts.length; i++) {
            var trimmedPart = parts[i].trim();
            if (trimmedPart.indexOf('=') === -1) {
                return trimmedPart;
            }
        }
        
        if (name.indexOf('/') !== -1) {
            return name.split('/')[0].trim();
        }
        if (name.indexOf(' - ') !== -1) {
            return name.split(' - ')[0].trim();
        }
        if (name.indexOf('|') !== -1) {
            return name.split('|')[0].trim();
        }
        
        return name.split('=')[0].trim();
    }
    
    return name;
}

function exportToJSON(includeHidden, ignoreDotted) {
    try {
        if (!allScanResults) {
            figma.ui.postMessage({
                type: 'error',
                message: 'Please scan the page first'
            });
            return;
        }
        
        var filteredResults = filterResults(allScanResults, includeHidden, ignoreDotted);
        var instanceData = {};
        
        // Create the new format with count:name pairs
        var countNamePairs = [];
        
        filteredResults.instances.forEach(function(instance) {
            countNamePairs.push(instance.count + ":" + instance.name);
            
            if (includeHidden) {
                instanceData[instance.name] = { 
                    total: instance.count,
                    hidden: instance.hiddenCount
                };
            } else {
                instanceData[instance.name] = instance.count;
            }
        });
        
        // Sort countNamePairs by count descending
        countNamePairs.sort(function(a, b) {
            var countA = parseInt(a.split(':')[0]);
            var countB = parseInt(b.split(':')[0]);
            return countB - countA;
        });
        
        var exportData = {
            metadata: {
                plugin: "Component Instance Counter",
                version: "1.0.0",
                exportDate: new Date().toISOString(),
                pageName: currentPageName,
                totalInstances: filteredResults.totalInstances,
                totalHidden: includeHidden ? filteredResults.totalHidden : undefined,
                uniqueComponents: filteredResults.instances.length,
                includeHidden: includeHidden,
                ignoreDotted: ignoreDotted
            },
            summary: countNamePairs,
            details: instanceData
        };
        
        figma.ui.postMessage({
            type: 'export-json',
            data: exportData
        });
        
    } catch (error) {
        figma.ui.postMessage({
            type: 'error',
            message: error.message
        });
    }
}

function exportToCSV(includeHidden, ignoreDotted) {
    try {
        if (!allScanResults) {
            figma.ui.postMessage({
                type: 'error',
                message: 'Please scan the page first'
            });
            return;
        }
        
        var filteredResults = filterResults(allScanResults, includeHidden, ignoreDotted);
        
        // Create CSV content
        var csvContent = includeHidden ? "Count,Instance Name,Hidden Count\n" : "Count,Instance Name\n";
        
        // Sort by count descending
        var sortedInstances = filteredResults.instances.slice().sort(function(a, b) { 
            return b.count - a.count; 
        });
        
        sortedInstances.forEach(function(instance) {
            var escapedName = instance.name.indexOf(',') !== -1 ? 
                '"' + instance.name.replace(/"/g, '""') + '"' : instance.name;
            if (includeHidden) {
                csvContent += instance.count + "," + escapedName + "," + instance.hiddenCount + "\n";
            } else {
                csvContent += instance.count + "," + escapedName + "\n";
            }
        });
        
        // Add summary
        csvContent += "\nTotal Instances," + filteredResults.totalInstances + "\n";
        if (includeHidden) {
            csvContent += "Total Hidden," + filteredResults.totalHidden + "\n";
        }
        csvContent += "Unique Components," + sortedInstances.length + "\n";
        csvContent += "Page Name," + currentPageName + "\n";
        csvContent += "Export Date," + new Date().toISOString() + "\n";
        csvContent += "Include Hidden," + includeHidden + "\n";
        csvContent += "Ignore Dotted," + ignoreDotted + "\n";
        
        var exportData = {
            csv: csvContent,
            metadata: {
                totalInstances: filteredResults.totalInstances,
                totalHidden: includeHidden ? filteredResults.totalHidden : undefined,
                uniqueComponents: sortedInstances.length,
                pageName: currentPageName,
                includeHidden: includeHidden,
                ignoreDotted: ignoreDotted
            }
        };
        
        figma.ui.postMessage({
            type: 'export-csv',
            data: exportData
        });
        
    } catch (error) {
        figma.ui.postMessage({
            type: 'error',
            message: error.message
        });
    }
}

function applyFilter(includeHidden, ignoreDotted) {
    if (!allScanResults) {
        figma.ui.postMessage({
            type: 'error',
            message: 'Please scan the page first'
        });
        return;
    }
    
    var filteredResults = filterResults(allScanResults, includeHidden, ignoreDotted);
    figma.ui.postMessage({
        type: 'scan-results',
        data: filteredResults
    });
}

figma.ui.onmessage = function(message) {
    if (message.type === 'scan-instances') {
        scanInstances();
    } else if (message.type === 'apply-filter') {
        applyFilter(message.includeHidden || false, message.ignoreDotted !== false);
    } else if (message.type === 'export-json') {
        exportToJSON(message.includeHidden || false, message.ignoreDotted !== false);
    } else if (message.type === 'export-csv') {
        exportToCSV(message.includeHidden || false, message.ignoreDotted !== false);
    }
};