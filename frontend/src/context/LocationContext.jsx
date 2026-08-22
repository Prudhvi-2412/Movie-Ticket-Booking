import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../lib/api';

const LocationContext = createContext(null);
const STORAGE_KEY = 'cinewave.locationId';

/**
 * The selected city is global application state: it scopes movies, theatres
 * and showtimes everywhere. Persisting it means a returning visitor lands
 * straight in their city rather than being asked again every visit.
 */
export function LocationProvider({ children }) {
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Opened by the navbar, and automatically on a first visit with no city set.
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/locations', { auth: false });
      setLocations(res.locations || []);
      return res.locations || [];
    } catch (err) {
      setError(err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().then((list) => {
      if (list.length === 0) return;
      // A stored city that has since been disabled must not silently filter
      // everything to nothing — fall back to asking again.
      const stored = localStorage.getItem(STORAGE_KEY);
      const isValid = stored && list.some((l) => l.location_id === Number(stored));
      if (!isValid) {
        localStorage.removeItem(STORAGE_KEY);
        setLocationId(null);
        setPickerOpen(true);
      }
    });
  }, [load]);

  const selectLocation = useCallback((id) => {
    setLocationId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
    setPickerOpen(false);
  }, []);

  const clearLocation = useCallback(() => {
    setLocationId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const location = useMemo(
    () => locations.find((l) => l.location_id === locationId) || null,
    [locations, locationId]
  );

  const value = useMemo(() => ({
    locations,
    location,
    locationId,
    city: location?.city || null,
    loading,
    error,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    selectLocation,
    clearLocation,
    reload: load
  }), [locations, location, locationId, loading, error, pickerOpen, selectLocation, clearLocation, load]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export const useLocationContext = () => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationContext must be used inside a LocationProvider');
  return ctx;
};
