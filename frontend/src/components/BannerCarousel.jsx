import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Play, Film } from 'lucide-react';

export const BannerCarousel = ({ movie }) => {
  if (!movie) return null;

  return (
    <div className="relative rounded-3xl overflow-hidden mb-12 glass-slate-card border border-[#30363D] shadow-2xl group">
      
      {/* Ambient Backdrop Banner */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <img
          src={movie.banner_url || movie.poster_url}
          alt={movie.title}
          className="w-full h-full object-cover opacity-20 filter blur-sm scale-105 group-hover:scale-110 transition-transform duration-1000"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0D1117] via-[#0D1117]/85 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-transparent to-transparent"></div>
      </div>

      {/* Content Layout */}
      <div className="relative z-10 p-8 md:p-14 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
        
        {/* Left Text Column */}
        <div className="md:col-span-2 space-y-5">
          
          <div className="flex flex-wrap items-center gap-3">
            <span className="badge-gold flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold">
              <Star className="w-3.5 h-3.5 fill-[#FFD700]" /> {movie.rating || '8.8'} Rating
            </span>
            <span className="glass-slate-pill px-3 py-1 rounded-full text-xs font-bold text-[#F0F6FC]">
              {movie.genre}
            </span>
            <span className="glass-slate-pill px-3 py-1 rounded-full text-xs font-bold text-[#00E5FF]">
              {movie.language}
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-none group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-[#FF0055] transition-all">
            {movie.title}
          </h1>

          <p className="text-sm md:text-base text-[#8B949E] line-clamp-3 max-w-2xl font-normal leading-relaxed">
            {movie.description}
          </p>

          <div className="pt-2 text-xs text-[#8B949E] flex items-center gap-4">
            <span><strong>Duration:</strong> {movie.duration_minutes} Mins</span>
            <span>•</span>
            <span><strong>Release:</strong> {movie.release_date || '2024'}</span>
          </div>

          {/* Action CTAs */}
          <div className="pt-4 flex flex-wrap items-center gap-4">
            <Link
              to={`/movie/${movie.movie_id}`}
              className="btn-electric-crimson py-3.5 px-8 text-sm"
            >
              <Film className="w-4 h-4" /> Book Tickets
            </Link>

            {movie.trailer_url && (
              <a
                href={movie.trailer_url}
                target="_blank"
                rel="noreferrer"
                className="btn-frosted-slate py-3 px-6 text-sm group/btn"
              >
                <div className="relative w-6 h-6 rounded-full bg-[#FF0055]/20 flex items-center justify-center border border-[#FF0055]/40">
                  <Play className="w-3.5 h-3.5 text-[#FF0055] fill-[#FF0055] ml-0.5" />
                </div>
                Watch Trailer
              </a>
            )}
          </div>
        </div>

        {/* Floating Poster Card */}
        <div className="hidden md:flex justify-end perspective-1000">
          <div className="w-64 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(255,0,85,0.35)] border-2 border-[#30363D] rotate-2 hover:rotate-0 hover:scale-105 transition-all duration-500 relative">
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-transparent to-transparent opacity-60"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
