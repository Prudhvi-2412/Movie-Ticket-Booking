import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MovieCard } from '../components/MovieCard';
import { BannerCarousel } from '../components/BannerCarousel';
import { Film, Filter, Zap, Lock, Cpu, Database } from 'lucide-react';

export const HomePage = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');

  const genres = ['All', 'Action', 'Sci-Fi', 'Biography', 'Thriller', 'Drama', 'Romance'];
  const languages = ['All', 'English', 'Hindi', 'Telugu', 'Tamil'];

  useEffect(() => {
    fetchMovies();
  }, [selectedGenre, selectedLanguage]);

  const fetchMovies = async () => {
    setLoading(true);
    try {
      let query = '/movies?';
      if (selectedGenre && selectedGenre !== 'All') query += `genre=${selectedGenre}&`;
      if (selectedLanguage && selectedLanguage !== 'All') query += `language=${selectedLanguage}&`;
      if (searchQuery) query += `search=${searchQuery}&`;

      const res = await api.get(query);
      if (res.success) {
        setMovies(res.movies);
      }
    } catch (err) {
      console.error('Error fetching movies:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMovies = movies.filter(m => {
    if (!searchQuery) return true;
    return m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           m.genre.toLowerCase().includes(searchQuery.toLowerCase()) ||
           m.language.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 pt-6">
        {/* Banner Carousel for Top Movie */}
        {movies.length > 0 && <BannerCarousel movie={movies[0]} />}

        {/* Distributed Architecture Live Banner */}
        <div className="glass-panel p-4 mb-8 border border-red-500/20 bg-gradient-to-r from-slate-900 via-red-950/20 to-slate-900 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center">
              <Zap className="w-5 h-5 text-red-500 animate-pulse" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-red-400">Distributed Lock & Messaging Architecture</span>
              <p className="text-xs text-gray-300">Redis TTL Seat Locks • Apache Kafka Events • MySQL ACID Transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-amber-400" /> Realtime TTL Lock</span>
            <span className="flex items-center gap-1"><Cpu className="w-3.5 h-3.5 text-purple-400" /> Kafka Async Worker</span>
            <span className="flex items-center gap-1"><Database className="w-3.5 h-3.5 text-blue-400" /> Partitioned MySQL</span>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Film className="w-6 h-6 text-red-500" /> Now Showing Movies
            </h2>
            <p className="text-xs text-gray-400">Explore movies and lock your preferred cinema seats</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Filter className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400">Genre:</span>
              <select
                value={selectedGenre}
                onChange={(e) => setSelectedGenre(e.target.value)}
                className="bg-transparent text-gray-200 font-semibold focus:outline-none cursor-pointer"
              >
                {genres.map(g => <option key={g} value={g} className="bg-slate-900">{g}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-gray-400">Language:</span>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-transparent text-gray-200 font-semibold focus:outline-none cursor-pointer"
              >
                {languages.map(l => <option key={l} value={l} className="bg-slate-900">{l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Movie Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-gray-400 font-mono">Fetching Movies...</span>
          </div>
        ) : filteredMovies.length === 0 ? (
          <div className="glass-panel py-16 text-center text-gray-400">
            <p className="text-lg font-bold">No movies found</p>
            <p className="text-xs text-gray-500 mt-1">Try adjusting your filters or search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredMovies.map(movie => (
              <MovieCard key={movie.movie_id} movie={movie} />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
