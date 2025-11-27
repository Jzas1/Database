"use client";

import { useState, useRef, useEffect } from "react";

// All available metrics - must match ConversionDashboard.jsx
const ALL_METRICS = [
  { k: "spend",       label: "Spend" },
  { k: "impressions", label: "Impressions" },
  { k: "responses",   label: "Responses" },
  { k: "conversions", label: "Conversions" },
  { k: "revenue",     label: "Revenue" },
  { k: "cpr",         label: "Cost Per Response" },
  { k: "cpc",         label: "Cost Per Conversion" },
  { k: "roas",        label: "ROAS" },
  { k: "cpm",         label: "CPM" },
  { k: "spotCount",   label: "Spot Count" },
  { k: "respConvRate", label: "Response to Conv %" },
];

const DEFAULT_METRICS = ['spend', 'responses', 'cpr', 'conversions', 'cpc', 'revenue', 'impressions'];

// KPI metrics available for the top cards
const KPI_METRICS = [
  { k: "totalSpend",    label: "Total Spend" },
  { k: "totalRevenue",  label: "Total Revenue" },
  { k: "conversions",   label: "Conversions" },
  { k: "roas",          label: "ROAS" },
  { k: "avgCpp",        label: "Avg CPP" },
  { k: "impressions",   label: "Impressions" },
  { k: "responses",     label: "Responses" },
  { k: "cpr",           label: "Cost Per Response" },
];

const DEFAULT_KPI_METRICS = ['totalSpend', 'totalRevenue', 'conversions', 'roas', 'avgCpp'];

// Daily chart metrics
const DAILY_CHART_METRICS = [
  { k: "spend",       label: "Spend" },
  { k: "impressions", label: "Impressions" },
  { k: "conversions", label: "Conversions" },
  { k: "revenue",     label: "Revenue" },
  { k: "responses",   label: "Responses" },
];

const DEFAULT_DAILY_METRICS = ['spend', 'impressions'];

export default function AdminPanel({ layout, onLayoutChange, onSave, isSaving }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [expandedModule, setExpandedModule] = useState(null);
  const [panelWidth, setPanelWidth] = useState(384); // Default width (w-96 = 384px)
  const [isResizing, setIsResizing] = useState(false);
  const dragNode = useRef(null);
  const panelRef = useRef(null);

  // Handle resize drag
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      // Clamp between 280px and 600px
      setPanelWidth(Math.min(600, Math.max(280, newWidth)));
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleToggle = (moduleId) => {
    const newModules = layout.modules.map((m) =>
      m.id === moduleId ? { ...m, visible: !m.visible } : m
    );
    onLayoutChange({ ...layout, modules: newModules });
  };

  const handleHeatmapToggle = (moduleId) => {
    const newModules = layout.modules.map((m) =>
      m.id === moduleId ? { ...m, heatmapEnabled: !m.heatmapEnabled } : m
    );
    onLayoutChange({ ...layout, modules: newModules });
  };

  const handleMetricToggle = (moduleId, metricKey) => {
    const newModules = layout.modules.map((m) => {
      if (m.id !== moduleId) return m;
      const currentMetrics = m.enabledMetrics || DEFAULT_METRICS;
      const newMetrics = currentMetrics.includes(metricKey)
        ? currentMetrics.filter(k => k !== metricKey)
        : [...currentMetrics, metricKey];
      return { ...m, enabledMetrics: newMetrics };
    });
    onLayoutChange({ ...layout, modules: newModules });
  };

  // Handle KPI metric toggle
  const handleKpiMetricToggle = (metricKey) => {
    const newModules = layout.modules.map((m) => {
      if (m.id !== 'kpis') return m;
      const currentMetrics = m.enabledKpis || DEFAULT_KPI_METRICS;
      const newMetrics = currentMetrics.includes(metricKey)
        ? currentMetrics.filter(k => k !== metricKey)
        : [...currentMetrics, metricKey];
      // Enforce min 2, max 6 KPIs
      if (newMetrics.length < 2 || newMetrics.length > 6) return m;
      return { ...m, enabledKpis: newMetrics };
    });
    onLayoutChange({ ...layout, modules: newModules });
  };

  // Handle Daily Chart metric toggle (max 2)
  const handleDailyMetricToggle = (metricKey) => {
    const newModules = layout.modules.map((m) => {
      if (m.id !== 'dailyChart') return m;
      const currentMetrics = m.enabledDailyMetrics || DEFAULT_DAILY_METRICS;

      if (currentMetrics.includes(metricKey)) {
        // Removing - but must keep at least 1
        const newMetrics = currentMetrics.filter(k => k !== metricKey);
        if (newMetrics.length < 1) return m;
        return { ...m, enabledDailyMetrics: newMetrics };
      } else {
        // Adding - max 2
        if (currentMetrics.length >= 2) return m;
        return { ...m, enabledDailyMetrics: [...currentMetrics, metricKey] };
      }
    });
    onLayoutChange({ ...layout, modules: newModules });
  };

  // Modules that support heatmap toggle and metrics config
  const heatmapModules = ['channelHeatmap', 'creativeHeatmap', 'daypartHeatmap', 'dayOfWeekHeatmap', 'channelByDaypart', 'channelByCreative'];

  // Modules that have special config panels
  const configModules = ['kpis', 'dailyChart', 'notes', 'image', ...heatmapModules];

  // Handle image URL change
  const handleImageUrlChange = (url) => {
    const newModules = layout.modules.map((m) => {
      if (m.id !== 'image') return m;
      return { ...m, imageUrl: url };
    });
    onLayoutChange({ ...layout, modules: newModules });
  };

  // State for new note input
  const [newNote, setNewNote] = useState('');

  // Handle adding a note
  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const newModules = layout.modules.map((m) => {
      if (m.id !== 'notes') return m;
      const currentNotes = m.notes || [];
      return { ...m, notes: [...currentNotes, newNote.trim()] };
    });
    onLayoutChange({ ...layout, modules: newModules });
    setNewNote('');
  };

  // Handle removing a note
  const handleRemoveNote = (index) => {
    const newModules = layout.modules.map((m) => {
      if (m.id !== 'notes') return m;
      const currentNotes = m.notes || [];
      return { ...m, notes: currentNotes.filter((_, i) => i !== index) };
    });
    onLayoutChange({ ...layout, modules: newModules });
  };

  // Handle reordering notes
  const handleMoveNote = (index, direction) => {
    const newModules = layout.modules.map((m) => {
      if (m.id !== 'notes') return m;
      const currentNotes = [...(m.notes || [])];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= currentNotes.length) return m;
      [currentNotes[index], currentNotes[newIndex]] = [currentNotes[newIndex], currentNotes[index]];
      return { ...m, notes: currentNotes };
    });
    onLayoutChange({ ...layout, modules: newModules });
  };

  const handleDragStart = (e, index) => {
    dragNode.current = e.target;
    dragNode.current.addEventListener('dragend', handleDragEnd);
    setDraggedIndex(index);

    setTimeout(() => {
      if (dragNode.current) {
        dragNode.current.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnter = (e, index) => {
    if (draggedIndex === null || draggedIndex === index) return;
    const newModules = [...layout.modules];
    const draggedItem = newModules[draggedIndex];
    newModules.splice(draggedIndex, 1);
    newModules.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    onLayoutChange({ ...layout, modules: newModules });
  };

  const handleDragEnd = () => {
    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
      dragNode.current.removeEventListener('dragend', handleDragEnd);
      dragNode.current = null;
    }
    setDraggedIndex(null);
  };

  const moveUp = (index) => {
    if (index === 0) return;
    const newModules = [...layout.modules];
    [newModules[index - 1], newModules[index]] = [newModules[index], newModules[index - 1]];
    onLayoutChange({ ...layout, modules: newModules });
  };

  const moveDown = (index) => {
    if (index === layout.modules.length - 1) return;
    const newModules = [...layout.modules];
    [newModules[index], newModules[index + 1]] = [newModules[index + 1], newModules[index]];
    onLayoutChange({ ...layout, modules: newModules });
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-[#0B2A3C] text-white p-3 rounded-r-lg shadow-lg hover:bg-[#1a4a5e] transition-all"
        title="Admin Panel"
      >
        <svg
          className={`w-5 h-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed left-0 top-0 h-full bg-white shadow-2xl z-50 transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: `${panelWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={handleResizeStart}
          className={`absolute right-0 top-0 h-full w-2 cursor-ew-resize group ${isResizing ? 'bg-[#C49A49]' : 'hover:bg-[#C49A49]/50'}`}
          title="Drag to resize"
        >
          {/* Visual indicator */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-16 w-1 rounded-full bg-gray-300 group-hover:bg-[#C49A49] transition-colors" />
        </div>

        {/* Header */}
        <div className="bg-[#0B2A3C] text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#C49A49]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h2 className="text-lg font-semibold">Admin Panel</h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded"
              style={{ color: 'white', fontSize: '24px', lineHeight: '1', background: 'transparent', border: 'none', boxShadow: 'none' }}
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-300 mt-1">Configure modules & metrics</p>
        </div>

        {/* Module List */}
        <div className="p-4 overflow-y-auto" style={{ height: "calc(100% - 140px)" }}>
          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
            Click module name to configure metrics
          </p>

          <div className="space-y-2">
            {layout.modules.map((module, index) => (
              <div key={module.id}>
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragOver={(e) => e.preventDefault()}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    module.visible
                      ? "bg-green-50 border-green-200"
                      : "bg-gray-50 border-gray-200"
                  } ${draggedIndex === index ? "opacity-50 scale-95" : ""}`}
                >
                  {/* Up/Down Arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveDown(index)}
                      disabled={index === layout.modules.length - 1}
                      className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>

                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={module.visible}
                    onChange={() => handleToggle(module.id)}
                    className="w-4 h-4 rounded border-gray-300 text-[#0B2A3C] focus:ring-[#C49A49]"
                  />

                  {/* Module Name - clickable for configurable modules */}
                  <button
                    onClick={() => configModules.includes(module.id) && setExpandedModule(expandedModule === module.id ? null : module.id)}
                    className={`flex-1 text-left text-sm ${module.visible ? "text-gray-800" : "text-gray-400"} ${configModules.includes(module.id) ? "hover:underline cursor-pointer" : ""}`}
                  >
                    {module.name}
                    {configModules.includes(module.id) && (
                      <svg className={`inline-block w-3 h-3 ml-1 transition-transform ${expandedModule === module.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>

                  {/* Heatmap Toggle */}
                  {heatmapModules.includes(module.id) && (
                    <button
                      onClick={() => handleHeatmapToggle(module.id)}
                      className={`p-1.5 rounded transition-all ${
                        module.heatmapEnabled !== false
                          ? "bg-[#C49A49] text-white"
                          : "bg-gray-200 text-gray-400"
                      }`}
                      title={module.heatmapEnabled !== false ? "Heatmap ON" : "Heatmap OFF"}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}

                  {/* Order Number */}
                  <span className="text-xs text-gray-400 font-mono w-5 text-center">
                    {index + 1}
                  </span>
                </div>

                {/* Expanded Config Panel for KPIs */}
                {expandedModule === module.id && module.id === 'kpis' && (
                  <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500 font-medium">Select KPI cards (2-6):</p>
                      <span className="text-xs text-gray-400">
                        {(module.enabledKpis || DEFAULT_KPI_METRICS).length} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {KPI_METRICS.map((metric) => {
                        const enabledKpis = module.enabledKpis || DEFAULT_KPI_METRICS;
                        const isEnabled = enabledKpis.includes(metric.k);
                        const canToggle = isEnabled ? enabledKpis.length > 2 : enabledKpis.length < 6;
                        return (
                          <label
                            key={metric.k}
                            className={`flex items-center gap-2 text-xs p-1.5 rounded transition-all ${
                              isEnabled ? "bg-green-100 text-green-800" : "bg-white text-gray-500 hover:bg-gray-100"
                            } ${!canToggle ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={!canToggle}
                              onChange={() => handleKpiMetricToggle(metric.k)}
                              className="w-3 h-3 rounded border-gray-300 text-[#0B2A3C] focus:ring-[#C49A49]"
                            />
                            <span className="truncate">{metric.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expanded Config Panel for Notes */}
                {expandedModule === module.id && module.id === 'notes' && (
                  <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 font-medium mb-2">Key Insights & Talking Points</p>

                    {/* Add new note input */}
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                        placeholder="Add a bullet point..."
                        className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C49A49] focus:border-[#C49A49] outline-none"
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!newNote.trim()}
                        className="px-3 py-2 bg-[#0B2A3C] text-white text-sm rounded-lg hover:bg-[#1a4a5e] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                      >
                        Add
                      </button>
                    </div>

                    {/* List of notes */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {(module.notes || []).map((note, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-200 group">
                          {/* Move buttons */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => handleMoveNote(idx, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleMoveNote(idx, 'down')}
                              disabled={idx === (module.notes || []).length - 1}
                              className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>

                          {/* Bullet icon */}
                          <span className="text-[#C49A49]">&#8226;</span>

                          {/* Note text */}
                          <span className="flex-1 text-sm text-gray-700">{note}</span>

                          {/* Delete button */}
                          <button
                            onClick={() => handleRemoveNote(idx)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}

                      {(!module.notes || module.notes.length === 0) && (
                        <p className="text-xs text-gray-400 text-center py-4">No notes yet. Add your first insight above.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Expanded Config Panel for Image Card */}
                {expandedModule === module.id && module.id === 'image' && (
                  <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 font-medium mb-2">Paste Screenshot or Drop Image</p>

                    {/* Drop zone / paste area */}
                    <div
                      className="w-full min-h-[100px] border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-[#C49A49] hover:bg-gray-50 transition-all"
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (items) {
                          for (let i = 0; i < items.length; i++) {
                            if (items[i].type.indexOf('image') !== -1) {
                              const file = items[i].getAsFile();
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                const newModules = layout.modules.map((m) => {
                                  if (m.id !== 'image') return m;
                                  return { ...m, imageData: event.target.result };
                                });
                                onLayoutChange({ ...layout, modules: newModules });
                              };
                              reader.readAsDataURL(file);
                              break;
                            }
                          }
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file && file.type.startsWith('image/')) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const newModules = layout.modules.map((m) => {
                              if (m.id !== 'image') return m;
                              return { ...m, imageData: event.target.result };
                            });
                            onLayoutChange({ ...layout, modules: newModules });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      tabIndex={0}
                    >
                      {module.imageData ? (
                        <img
                          src={module.imageData}
                          alt="Preview"
                          className="max-w-full max-h-40 mx-auto rounded border border-gray-200"
                        />
                      ) : (
                        <div className="text-gray-400">
                          <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm">Click here and paste (Ctrl+V)</p>
                          <p className="text-xs mt-1">or drag & drop an image</p>
                        </div>
                      )}
                    </div>

                    {/* Clear button */}
                    {module.imageData && (
                      <button
                        onClick={() => {
                          const newModules = layout.modules.map((m) => {
                            if (m.id !== 'image') return m;
                            return { ...m, imageData: null };
                          });
                          onLayoutChange({ ...layout, modules: newModules });
                        }}
                        className="mt-2 text-xs text-red-500 hover:text-red-700"
                      >
                        Remove Image
                      </button>
                    )}

                    {/* Caption input */}
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 mb-1">Caption (optional)</p>
                      <input
                        type="text"
                        value={module.imageCaption || ''}
                        onChange={(e) => {
                          const newModules = layout.modules.map((m) => {
                            if (m.id !== 'image') return m;
                            return { ...m, imageCaption: e.target.value };
                          });
                          onLayoutChange({ ...layout, modules: newModules });
                        }}
                        placeholder="Add a caption..."
                        className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#C49A49] focus:border-[#C49A49] outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Expanded Config Panel for Daily Chart */}
                {expandedModule === module.id && module.id === 'dailyChart' && (
                  <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500 font-medium">Select metrics (max 2):</p>
                      <span className="text-xs text-gray-400">
                        {(module.enabledDailyMetrics || DEFAULT_DAILY_METRICS).length}/2 selected
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {DAILY_CHART_METRICS.map((metric) => {
                        const enabledMetrics = module.enabledDailyMetrics || DEFAULT_DAILY_METRICS;
                        const isEnabled = enabledMetrics.includes(metric.k);
                        const canToggle = isEnabled ? enabledMetrics.length > 1 : enabledMetrics.length < 2;
                        return (
                          <label
                            key={metric.k}
                            className={`flex items-center gap-2 text-xs p-1.5 rounded transition-all ${
                              isEnabled ? "bg-green-100 text-green-800" : "bg-white text-gray-500 hover:bg-gray-100"
                            } ${!canToggle ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              disabled={!canToggle}
                              onChange={() => handleDailyMetricToggle(metric.k)}
                              className="w-3 h-3 rounded border-gray-300 text-[#0B2A3C] focus:ring-[#C49A49]"
                            />
                            <span className="truncate">{metric.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expanded Metrics Selection for Heatmaps */}
                {expandedModule === module.id && heatmapModules.includes(module.id) && (
                  <div className="ml-8 mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Select metrics to display:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_METRICS.map((metric) => {
                        const enabledMetrics = module.enabledMetrics || DEFAULT_METRICS;
                        const isEnabled = enabledMetrics.includes(metric.k);
                        return (
                          <label
                            key={metric.k}
                            className={`flex items-center gap-2 text-xs p-1.5 rounded cursor-pointer transition-all ${
                              isEnabled ? "bg-green-100 text-green-800" : "bg-white text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => handleMetricToggle(module.id, metric.k)}
                              className="w-3 h-3 rounded border-gray-300 text-[#0B2A3C] focus:ring-[#C49A49]"
                            />
                            <span className="truncate">{metric.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="w-full py-3 bg-[#0B2A3C] text-white rounded-lg font-medium hover:bg-[#1a4a5e] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Layout
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
