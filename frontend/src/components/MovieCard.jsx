import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Clock, Ticket } from 'lucide-react';

export const MovieCard = ({ movie }) => {
  return (
    <div className="glass-panel group relative overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-red-950/30 flex flex-col h-full">
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
        <img
          src={movie.poster_url || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80'}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Rating Pill */}
        <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-700 flex items-center gap-1 text-xs font-bold text-amber-400">
          <Star className="w-3.5 h-3.5 fill-amber-400" />
          {movie.rating ? Number(movie.rating).toFixed(1) : '8.5'}
        </div>

        {/* Language Badge */}
        <div className="absolute top-3 left-3 bg-red-600/90 backdrop-blur-md px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase text-white tracking-wider">
          {movie.language}
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
          <Link
            to={`/movie/${movie.movie_id}`}
            className="w-full btn-primary py-2.5 justify-center text-xs"
          >
            <Ticket className="w-4 h-4" /> Book Shows
          </Link>
        </div>
      </div>

      {/* Content Info */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <span className="text-[11px] font-semibold text-red-400 uppercase tracking-wider block mb-1">
            {movie.genre}
          </span>
          <h3 className="text-base font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
            {movie.title}
          </h3>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-500" /> {movie.duration_minutes} mins
          </span>
          <span className="text-slate-500 font-mono text-[10px]">3D / 2D / IMAX</span>
        </div>
      </div>
    </div>
  );
};
