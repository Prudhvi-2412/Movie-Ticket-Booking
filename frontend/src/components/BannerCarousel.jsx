import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Play, Sparkles, ShieldAlert } from 'lucide-react';

export const BannerCarousel = ({ movie }) => {
  if (!movie) return null;

  return (
    <div className="relative rounded-3xl overflow-hidden mb-12 glass-panel border border-slate-700/50 shadow-2xl">
      {/* Background Banner Backdrop */}
      <div className="absolute inset-0 z-0">
        <img
          src={movie.banner_url || movie.poster_url || 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1200&auto=format&fit=crop&q=80'}
          alt={movie.title}
          className="w-full h-full object-cover opacity-30 filter blur-xs scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
      </div>

      {/* Content Grid */}
      <div className="relative z-10 p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <span className="badge badge-red flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> FEATURED PREMIERE
            </span>
            <span className="badge badge-gold flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400" /> {movie.rating || '8.8'} / 10 IMDb
            </span>
            <span className="text-xs font-bold text-gray-400">{movie.language} • {movie.genre}</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-black text-white leading-tight">
            {movie.title}
          </h1>

          <p className="text-sm md:text-base text-gray-300 line-clamp-3 max-w-2xl font-normal leading-relaxed">
            {movie.description}
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <Link to={`/movie/${movie.movie_id}`} className="btn-primary py-3.5 px-8 text-sm">
              Reserve Seats Now
            </Link>
            {movie.trailer_url && (
              <a
                href={movie.trailer_url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary py-3 px-6 text-sm"
              >
                <Play className="w-4 h-4 text-red-500 fill-red-500" /> Watch Trailer
              </a>
            )}
          </div>
        </div>

        {/* Poster Thumbnail */}
        <div className="hidden md:flex justify-end">
          <div className="w-56 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-700/60 rotate-2 hover:rotate-0 transition-transform duration-300">
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" />
          </div>
        </div>
      </div>
    </div>
  );
};
