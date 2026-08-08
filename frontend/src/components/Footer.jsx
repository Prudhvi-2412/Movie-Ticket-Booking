import React from 'react';
import { Film, ShieldCheck } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-[#30363D] bg-[#0D1117] mt-24 py-14 px-6 relative overflow-hidden">
      
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10 mb-10 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF0055] to-[#FF5202] flex items-center justify-center shadow-crimson-glow">
              <Film className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black text-white">CineWave</span>
          </div>
          <p className="text-xs text-[#8B949E] leading-relaxed mb-4">
            The ultimate movie ticket booking experience. Reserve cinema seats in real-time with instant digital M-Tickets.
          </p>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#00F5A0] badge-emerald px-3 py-1 rounded-full">
            <ShieldCheck className="w-4 h-4" /> 100% Secure Checkout
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#F0F6FC] mb-4 uppercase tracking-widest">Movies & Showtimes</h4>
          <ul className="space-y-2.5 text-xs text-[#8B949E]">
            <li><a href="#" className="hover:text-white transition-colors">Now Showing</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Upcoming Blockbusters</a></li>
            <li><a href="#" className="hover:text-white transition-colors">IMAX 3D Formats</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Dolby Atmos Theaters</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#F0F6FC] mb-4 uppercase tracking-widest">Cinemas & Cities</h4>
          <ul className="space-y-2.5 text-xs text-[#8B949E]">
            <li>PVR Directors Cut (Mumbai)</li>
            <li>INOX Luxe (Bengaluru)</li>
            <li>Cinepolis IMAX (Noida)</li>
            <li>Exclusive Premieres</li>
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#F0F6FC] mb-4 uppercase tracking-widest">Help & Legal</h4>
          <ul className="space-y-2.5 text-xs text-[#8B949E]">
            <li><a href="#" className="hover:text-white transition-colors">Customer Support</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Refund & Cancellation Policy</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto border-t border-[#30363D] pt-6 flex flex-col md:flex-row items-center justify-between text-xs text-[#8B949E] relative z-10">
        <p>© 2026 CineWave Inc. All rights reserved.</p>
      </div>
    </footer>
  );
};
