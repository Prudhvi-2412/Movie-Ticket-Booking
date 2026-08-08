import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { MovieCard } from '../components/MovieCard';
import { BannerCarousel } from '../components/BannerCarousel';
import { Film, SlidersHorizontal } from 'lucide-react';

export const HomePage = () => {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedLanguage, setSelectedLanguage] = useState('All');

  const genres = ['All', 'Action', 'Sci-Fi', 'Biography', 'Thriller', 'Drama'];

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
    <div className="min-h-screen bg-[#0D1117] text-[#F0F6FC] flex flex-col selection:bg-[#FF0055] selection:text-white">
      
      {/* Navbar */}
      <Navbar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 pt-6">
        
        {/* Hero Spotlight Carousel */}
        {movies.length > 0 && <BannerCarousel movie={movies[0]} />}

        {/* Filter Bar & Now Showing Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-4">
          <div>
            <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Film className="w-7 h-7 text-[#FF0055]" /> Now Showing Movies
            </h2>
          </div>

          {/* Genre Filter Pills */}
          <div className="flex flex-wrap items-center gap-2.5 glass-slate-card p-2 rounded-2xl border border-[#30363D]">
            <div className="flex items-center gap-2 text-xs text-[#8B949E] px-2 font-semibold">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF0055]" /> Genre:
            </div>
            {genres.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  selectedGenre === g
                    ? 'bg-gradient-to-r from-[#FF0055] to-[#FF5202] text-white shadow-crimson-glow'
                    : 'text-[#8B949E] hover:text-white hover:bg-white/5'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Movie Grid */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 border-4 border-[#FF0055] border-t-transparent rounded-full animate-spin shadow-crimson-glow"></div>
            <span className="text-xs text-[#8B949E] font-mono tracking-wider">LOADING MOVIES...</span>
          </div>
        ) : filteredMovies.length === 0 ? (
          <div className="glass-slate-card py-20 text-center text-[#8B949E]">
            <p className="text-xl font-bold text-white">No movies match your search</p>
            <p className="text-xs text-[#8B949E] mt-1">Try selecting 'All' or searching for another title.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-7">
            {filteredMovies.map(movie => (
              <MovieCard key={movie.movie_id} movie={movie} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
