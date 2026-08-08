import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Clock, Ticket } from 'lucide-react';

export const MovieCard = ({ movie }) => {
  return (
    <div className="glass-slate-card group relative overflow-hidden rounded-3xl transition-all duration-500 hover:-translate-y-2 hover:scale-[1.02] hover:shadow-crimson-glow hover:border-[#FF0055]/60 flex flex-col h-full">
      
      {/* 2:3 Cinematic Poster Container */}
      <div className="relative aspect-[2/3] overflow-hidden bg-[#0D1117]">
        <img
          src={movie.poster_url || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80'}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
          loading="lazy"
        />

        {/* Gradient Mask */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-transparent to-transparent opacity-80 group-hover:opacity-40 transition-opacity"></div>

        {/* Rating Badge (Cyber Gold) */}
        <div className="absolute top-3.5 right-3.5 badge-gold px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
          <Star className="w-3.5 h-3.5 fill-[#FFD700] text-[#FFD700]" />
          {movie.rating ? Number(movie.rating).toFixed(1) : '8.5'}
        </div>

        {/* Language Badge */}
        <div className="absolute top-3.5 left-3.5 badge-crimson px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">
          {movie.language}
        </div>

        {/* Fast-Book Hover Drawer */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D1117] via-[#0D1117]/80 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-5 space-y-3">
          <div className="text-xs text-[#8B949E] space-y-1">
            <p className="font-bold text-white line-clamp-1">{movie.title}</p>
            <p className="text-[11px] text-[#8B949E] line-clamp-2">{movie.description}</p>
          </div>

          <Link
            to={`/movie/${movie.movie_id}`}
            className="w-full btn-electric-crimson py-3 justify-center text-xs font-bold tracking-wide"
          >
            <Ticket className="w-4 h-4" /> Fast Book Seats
          </Link>
        </div>
      </div>

      {/* Info Footer */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <span className="text-[10px] font-bold text-[#FF0055] uppercase tracking-widest block mb-1">
            {movie.genre}
          </span>
          <h3 className="text-base font-extrabold text-white line-clamp-1 group-hover:text-[#FF0055] transition-colors">
            {movie.title}
          </h3>
        </div>

        <div className="pt-3 border-t border-[#30363D] flex items-center justify-between text-xs text-[#8B949E]">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-[#8B949E]" /> {movie.duration_minutes} mins
          </span>
          <span className="glass-slate-pill px-2 py-0.5 rounded text-[10px] font-mono text-[#F0F6FC]">IMAX / 3D</span>
        </div>
      </div>
    </div>
  );
};
