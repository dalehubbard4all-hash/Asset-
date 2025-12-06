import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";

// --- Configuration & Types ---

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

interface Asset {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  cost?: number;
  location: string;
  status: "Active" | "Maintenance" | "Retired";
  serialNumber: string;
  description: string;
}

const CATEGORIES = ["Electronics", "Furniture", "Machinery", "Vehicles", "Software", "Other"];
const LOCATIONS = [
  "Camp Ware",
  "Camp Tubman",
  "14 Military ART",
  "14 Military Lab",
  "LCG",
  "Camp Zwedru",
  "Camp Voinjama",
  "ACOS MOD",
  "Camp Buchanan"
];
const STATUSES = ["Active", "Maintenance", "Retired"];

// --- Helper Functions ---

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatCurrency = (amount: number) => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

// --- Components ---

const Sidebar = ({ currentView, setView }: { currentView: string, setView: (v: string) => void }) => (
  <div className="sidebar">
    <div style={{ padding: '0 0 2rem 0', fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--primary)' }}>
      📦 AssetManager
    </div>
    <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
      Dashboard
    </div>
    <div className={`nav-item ${currentView === 'inventory' ? 'active' : ''}`} onClick={() => setView('inventory')}>
      Inventory List
    </div>
    <div className={`nav-item ${currentView === 'reports' ? 'active' : ''}`} onClick={() => setView('reports')}>
      Reports
    </div>
    <div className={`nav-item ${currentView === 'add' ? 'active' : ''}`} onClick={() => setView('add')}>
      Add Asset
    </div>
    <div style={{ marginTop: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>
      v1.0.0 Web Edition
    </div>
  </div>
);

const Dashboard = ({ assets }: { assets: Asset[] }) => {
  const totalValue = assets.reduce((sum, a) => sum + (a.status !== 'Retired' ? (a.cost || 0) : 0), 0);
  const activeCount = assets.filter(a => a.status === 'Active').length;
  const maintenanceCount = assets.filter(a => a.status === 'Maintenance').length;

  // Simple category grouping
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1; });
    return counts;
  }, [assets]);

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Dashboard</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Asset Value</div>
          <div className="stat-value">{formatCurrency(totalValue)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Assets</div>
          <div className="stat-value">{assets.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Maintenance</div>
          <div className="stat-value" style={{ color: '#d97706' }}>{maintenanceCount}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3>Category Distribution</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {Object.entries(categoryData).map(([cat, count]) => (
            <div key={cat} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', minWidth: '120px' }}>
              <div style={{ fontWeight: 600 }}>{cat}</div>
              <div style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{count}</div>
            </div>
          ))}
          {Object.keys(categoryData).length === 0 && <div style={{ color: '#94a3b8' }}>No assets recorded yet.</div>}
        </div>
      </div>
    </div>
  );
};

const AssetForm = ({ onSave, initialData }: { onSave: (asset: Asset) => void, initialData?: Partial<Asset> }) => {
  const [formData, setFormData] = useState<Partial<Asset>>({
    name: '',
    category: 'Electronics',
    purchaseDate: new Date().toISOString().split('T')[0],
    cost: undefined,
    location: 'Camp Ware',
    status: 'Active',
    serialNumber: '',
    description: '',
    ...initialData
  });
  
  const [quantity, setQuantity] = useState(1);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Reset quantity when initialData changes (e.g. switching between edit/add)
  useEffect(() => {
    if (initialData?.id) {
        setQuantity(1);
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // If it's the cost field and value is empty, set to undefined, otherwise parse float
    const newValue = name === 'cost' 
      ? (value === '' ? undefined : parseFloat(value)) 
      : value;
    
    setFormData(prev => ({ ...prev, [name]: newValue }));
  };

  const handleAiFill = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    setAiError("");

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Extract asset details from the following text into a JSON object. 
        Text: "${aiPrompt}".
        If a field is missing, make a reasonable guess or leave it null.
        Extract quantity if mentioned (default 1).
        Current date is ${new Date().toISOString().split('T')[0]}.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              category: { type: Type.STRING, enum: CATEGORIES },
              purchaseDate: { type: Type.STRING, description: "YYYY-MM-DD format" },
              cost: { type: Type.NUMBER },
              location: { type: Type.STRING, enum: LOCATIONS },
              status: { type: Type.STRING, enum: STATUSES },
              serialNumber: { type: Type.STRING },
              description: { type: Type.STRING },
              quantity: { type: Type.INTEGER }
            },
            required: ["name"]
          }
        }
      });

      const extracted = JSON.parse(response.text || "{}");
      
      setFormData(prev => ({
        ...prev,
        ...extracted,
        // Ensure defaults if AI returns null/undefined
        category: extracted.category || prev.category || 'Electronics',
        location: extracted.location || prev.location || 'Camp Ware',
        status: extracted.status || prev.status || 'Active',
      }));

      if (extracted.quantity && extracted.quantity > 0) {
        setQuantity(extracted.quantity);
      } else {
        setQuantity(1);
      }

    } catch (e) {
      setAiError("Failed to interpret text. Please try again or fill manually.");
      console.error(e);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name) {
      if (initialData?.id) {
        // Edit mode - single update
        onSave({
          id: initialData.id,
          ...formData as Asset
        });
      } else {
        // Create mode - loop for quantity
        const count = Math.max(1, quantity);
        for (let i = 0; i < count; i++) {
          onSave({
            id: generateId(),
            ...formData as Asset
          });
        }
      }
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: '1.5rem' }}>{initialData?.id ? 'Edit Asset' : 'Add New Asset'}</h2>
      
      {!initialData?.id && (
        <div className="card ai-panel">
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ✨ AI Smart Entry
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#475569' }}>
            Describe the asset naturally (e.g., "Bought 3 Herman Miller chairs for Camp Tubman today").
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
              type="text" 
              className="input-control" 
              placeholder="Type asset description here..."
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiFill()}
            />
            <button 
              className="btn btn-primary" 
              onClick={handleAiFill} 
              disabled={isAiLoading || !aiPrompt}
            >
              {isAiLoading ? <span className="spinner"></span> : 'Auto-Fill'}
            </button>
          </div>
          {aiError && <div style={{ color: 'var(--danger)', marginTop: '0.5rem', fontSize: '0.875rem' }}>{aiError}</div>}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="input-group">
            <label>Asset Name *</label>
            <input required name="name" className="input-control" value={formData.name} onChange={handleChange} />
          </div>
          <div className="input-group">
            <label>Category</label>
            <select name="category" className="input-control" value={formData.category} onChange={handleChange}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>Cost ($)</label>
            <input type="number" step="0.01" name="cost" className="input-control" value={formData.cost === undefined ? '' : formData.cost} onChange={handleChange} />
          </div>
          
          <div className="input-group">
            <label>Quantity</label>
            <input 
              type="number" 
              min="1" 
              step="1" 
              name="quantity" 
              className="input-control" 
              value={quantity} 
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              disabled={!!initialData?.id} // Disable editing quantity when updating an existing asset
              title={initialData?.id ? "Quantity cannot be changed when editing an individual asset." : "Number of identical assets to create"}
            />
          </div>

          <div className="input-group">
            <label>Purchase Date</label>
            <input type="date" name="purchaseDate" className="input-control" value={formData.purchaseDate} onChange={handleChange} />
          </div>
          <div className="input-group">
            <label>Location</label>
            <select name="location" className="input-control" value={formData.location} onChange={handleChange}>
               {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label>Status</label>
            <select name="status" className="input-control" value={formData.status} onChange={handleChange}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label>Serial Number {quantity > 1 ? '(Applied to all)' : ''}</label>
            <input name="serialNumber" className="input-control" value={formData.serialNumber} onChange={handleChange} />
          </div>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label>Description</label>
            <textarea name="description" className="input-control" rows={3} value={formData.description} onChange={handleChange} />
          </div>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
          <button type="submit" className="btn btn-primary">
            {initialData?.id ? 'Save Changes' : (quantity > 1 ? `Create ${quantity} Assets` : 'Save Asset')}
          </button>
        </div>
      </form>
    </div>
  );
};

const AssetList = ({ assets, onDelete, onEdit }: { assets: Asset[], onDelete: (id: string) => void, onEdit: (asset: Asset) => void }) => {
  const [filter, setFilter] = useState("");
  const filteredAssets = assets.filter(a => 
    a.name.toLowerCase().includes(filter.toLowerCase()) || 
    a.category.toLowerCase().includes(filter.toLowerCase()) ||
    a.location.toLowerCase().includes(filter.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Active': return 'badge badge-active';
      case 'Maintenance': return 'badge badge-maintenance';
      case 'Retired': return 'badge badge-retired';
      default: return 'badge';
    }
  };

  const handleExport = () => {
    const headers = ["ID", "Name", "Category", "Cost", "Date", "Location", "Status", "Serial"];
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + assets.map(a => `${a.id},"${a.name}",${a.category},${a.cost || 0},${a.purchaseDate},"${a.location}",${a.status},"${a.serialNumber}"`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "assets_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Asset Inventory</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            placeholder="Search assets..." 
            className="input-control" 
            style={{ width: '250px' }}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button onClick={handleExport} className="btn btn-secondary">Export CSV</button>
        </div>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Cost</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssets.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No assets found.</td></tr>
            ) : filteredAssets.map(asset => (
              <tr key={asset.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{asset.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{asset.serialNumber}</div>
                </td>
                <td>{asset.category}</td>
                <td>{formatCurrency(asset.cost || 0)}</td>
                <td>{asset.location}</td>
                <td><span className={getStatusBadge(asset.status)}>{asset.status}</span></td>
                <td>
                  <button className="btn btn-secondary" style={{ marginRight: '0.5rem', padding: '0.25rem 0.5rem' }} onClick={() => onEdit(asset)}>Edit</button>
                  <button className="btn btn-danger" style={{ padding: '0.25rem 0.5rem' }} onClick={() => onDelete(asset.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Reports = ({ assets }: { assets: Asset[] }) => {
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const locationStats = useMemo(() => {
    const stats: Record<string, { count: number, value: number }> = {};
    LOCATIONS.forEach(loc => {
      const locAssets = assets.filter(a => a.location === loc);
      stats[loc] = {
        count: locAssets.length,
        value: locAssets.reduce((sum, a) => sum + (a.status !== 'Retired' ? (a.cost || 0) : 0), 0)
      };
    });
    return stats;
  }, [assets]);

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const text = `Asset Report for ${selectedLocation}\nTotal Assets: ${locationStats[selectedLocation!].count}\nTotal Value: ${formatCurrency(locationStats[selectedLocation!].value)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Asset Report - ${selectedLocation}`,
          text: text,
        });
      } catch (err) {
        console.log("Share failed", err);
      }
    } else {
      alert("Report summary copied to clipboard:\n" + text);
      await navigator.clipboard.writeText(text);
    }
  };

  if (selectedLocation) {
    const reportAssets = assets.filter(a => a.location === selectedLocation);
    const stats = locationStats[selectedLocation];

    return (
      <div className="report-view">
        <div className="no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={() => setSelectedLocation(null)}>← Back to Overview</button>
          <div style={{ flex: 1 }}></div>
          <button className="btn btn-secondary" onClick={handleShare}>Share Report</button>
          <button className="btn btn-primary" onClick={handlePrint}>🖨️ Print Report</button>
        </div>

        <div className="card" style={{ boxShadow: 'none' }}>
           <div style={{ borderBottom: '2px solid var(--text-main)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h1 style={{ margin: 0, fontSize: '2rem' }}>Asset Inventory Report</h1>
              <h2 style={{ margin: '0.5rem 0 0 0', color: 'var(--text-sub)' }}>Location: {selectedLocation}</h2>
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>Generated on: {new Date().toLocaleDateString()}</div>
           </div>

           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
             <div>
               <div style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>Total Assets</div>
               <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.count}</div>
             </div>
             <div>
               <div style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>Total Value</div>
               <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatCurrency(stats.value)}</div>
             </div>
           </div>

           <table className="data-table">
             <thead>
               <tr>
                 <th>Asset Name</th>
                 <th>Category</th>
                 <th>Serial #</th>
                 <th>Status</th>
                 <th style={{ textAlign: 'right' }}>Cost</th>
               </tr>
             </thead>
             <tbody>
               {reportAssets.map(asset => (
                 <tr key={asset.id}>
                   <td>{asset.name}</td>
                   <td>{asset.category}</td>
                   <td>{asset.serialNumber || '-'}</td>
                   <td>{asset.status}</td>
                   <td style={{ textAlign: 'right' }}>{formatCurrency(asset.cost || 0)}</td>
                 </tr>
               ))}
               {reportAssets.length === 0 && <tr><td colSpan={5} style={{textAlign:'center', padding:'2rem'}}>No assets found for this location.</td></tr>}
             </tbody>
           </table>

           <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'space-between', pageBreakInside: 'avoid' }}>
             <div style={{ borderTop: '1px solid #000', width: '40%', padding: '0.5rem' }}>
               Signed (Officer in Charge)
             </div>
             <div style={{ borderTop: '1px solid #000', width: '40%', padding: '0.5rem' }}>
               Date
             </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Reports Overview</h2>
      <p style={{ color: 'var(--text-sub)', marginBottom: '1.5rem' }}>Select a location to generate and print a detailed asset report.</p>
      
      <div className="stats-grid">
        {LOCATIONS.map(loc => {
           const stats = locationStats[loc];
           return (
             <div key={loc} className="card nav-item" style={{ height: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }} onClick={() => setSelectedLocation(loc)}>
               <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{loc}</div>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
                 <span style={{ color: 'var(--text-sub)' }}>{stats.count} Assets</span>
                 <span style={{ fontWeight: '600' }}>{formatCurrency(stats.value)}</span>
               </div>
             </div>
           );
        })}
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const [view, setView] = useState("dashboard");
  const [assets, setAssets] = useState<Asset[]>(() => {
    const saved = localStorage.getItem("assets");
    return saved ? JSON.parse(saved) : [];
  });
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem("assets", JSON.stringify(assets));
  }, [assets]);

  const handleSaveAsset = (asset: Asset) => {
    setAssets(prev => {
      const exists = prev.find(p => p.id === asset.id);
      if (exists) {
        return prev.map(p => p.id === asset.id ? asset : p);
      }
      return [asset, ...prev];
    });
    setView("inventory");
    setEditingAsset(undefined);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this asset?")) {
      setAssets(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setView("add");
  };

  return (
    <div className="app-container">
      <Sidebar currentView={view} setView={(v) => { setView(v); if(v !== 'add') setEditingAsset(undefined); }} />
      <main className="main-content">
        {view === 'dashboard' && <Dashboard assets={assets} />}
        {view === 'inventory' && <AssetList assets={assets} onDelete={handleDelete} onEdit={handleEdit} />}
        {view === 'reports' && <Reports assets={assets} />}
        {view === 'add' && <AssetForm onSave={handleSaveAsset} initialData={editingAsset} />}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);