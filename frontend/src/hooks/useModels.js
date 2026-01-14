import { useState, useEffect } from 'react';

/**
 * Hook für Model-Management
 * Verwaltet verfügbare Modelle und aktuelles Modell
 */
export function useModels(bridge) {
  const [models, setModels] = useState([]);
  const [currentModel, setCurrentModel] = useState('');
  
  // Debug: Logge wichtige State-Änderungen
  useEffect(() => {
    if (models.length > 0) {
      console.log('📊 useModels: Modelle geladen:', models.length, 'Aktuelles Modell:', currentModel);
    }
  }, [models.length, currentModel]);
  
  // Model ändern
  const handleModelChange = (modelName) => {
    console.log('🔄 useModels: Modell geändert zu:', modelName);
    setCurrentModel(modelName);
    if (bridge && bridge.setModel) {
      bridge.setModel(modelName);
    } else {
      console.warn('⚠️ useModels: bridge.setModel nicht verfügbar');
    }
  };
  
  // Verarbeite ankiReceive Events für Models
  const handleAnkiReceive = (payload) => {
    // Filtere nur Flash-Modell
    const filterFlashOnly = (models) => {
      if (!models || !Array.isArray(models)) return [];
      return models.filter(m => m.name && m.name.includes('flash'));
    };

    if (payload.type === 'init') {
      // Prüfe ob API-Key vorhanden ist und lade Modelle
      console.log('init erhalten:', {
        hasApiKey: payload.hasApiKey,
        modelsCount: payload.models?.length || 0,
        models: payload.models,
        currentModel: payload.currentModel,
        currentDeck: payload.currentDeck
      });
      const hasApiKey = payload.hasApiKey || false;
      if (hasApiKey && payload.models && payload.models.length > 0) {
        const flashModels = filterFlashOnly(payload.models);
        setModels(flashModels);
        // Setze Flash-Modell als Standard, falls vorhanden
        const flashModel = flashModels.find(m => m.name.includes('flash')) || flashModels[0];
        setCurrentModel(flashModel?.name || payload.currentModel || '');
      } else if (payload.models && payload.models.length > 0) {
        // Auch ohne API-Key, wenn Modelle vorhanden (Fallback)
        const flashModels = filterFlashOnly(payload.models);
        setModels(flashModels);
        const flashModel = flashModels.find(m => m.name.includes('flash')) || flashModels[0];
        setCurrentModel(flashModel?.name || payload.currentModel || '');
      } else {
        setModels([]);
        setCurrentModel('');
      }
    } else if (payload.type === 'models_updated') {
      // Model-Liste wurde aktualisiert (z.B. nach Settings-Speicherung)
      console.log('models_updated erhalten:', {
        modelsCount: payload.models?.length || 0,
        models: payload.models,
        currentModel: payload.currentModel,
        hasApiKey: payload.hasApiKey,
        error: payload.error
      });
      const flashModels = filterFlashOnly(payload.models || []);
      setModels(flashModels);
      // Setze Flash-Modell als Standard, falls vorhanden
      const flashModel = flashModels.find(m => m.name.includes('flash')) || flashModels[0];
      setCurrentModel(flashModel?.name || payload.currentModel || '');
      // Zeige Fehler an, falls vorhanden
      if (payload.error) {
        console.error('Fehler beim Laden der Modelle:', payload.error);
      }
    }
  };
  
  // Settings speichern - aktualisiere Modelle wenn vom Dialog mitgegeben
  const handleSaveSettings = (settings) => {
    // Wenn Modelle vom SettingsDialog mitgegeben wurden (Browser-Modus), setze sie direkt
    if (settings.models && Array.isArray(settings.models) && settings.models.length > 0) {
      console.log('✅ useModels: Modelle vom SettingsDialog erhalten:', settings.models);
      setModels(settings.models);
      const modelToSet = settings.currentModel || settings.models[0].name;
      console.log('✅ useModels: Setze Modell auf:', modelToSet);
      setCurrentModel(modelToSet);
    } else {
      // In Anki werden die Modelle automatisch über push_updated_models aktualisiert
      console.log('⏳ useModels: Warte auf models_updated Event von Anki...');
    }
  };
  
  return {
    models,
    setModels,
    currentModel,
    setCurrentModel,
    handleModelChange,
    handleAnkiReceive,
    handleSaveSettings
  };
}


