import React from 'react';
import { Database, Zap, Cpu, Server, ShieldCheck } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-slate-800 bg-slate-950/80 mt-20 py-12 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div>
          <h3 className="text-lg font-bold text-white mb-3">CineWave Platform</h3>
          <p className="text-xs text-gray-400 leading-relaxed mb-4">
            Production-grade distributed movie ticket booking system built with Redis distributed locks, Apache Kafka event bus, and MySQL ACID transactions.
          </p>
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <ShieldCheck className="w-4 h-4" /> System Healthy & Operating
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Target Tech Stack</h4>
          <ul className="space-y-2 text-xs text-gray-400">
            <li className="flex items-center gap-2"><Database className="w-3.5 h-3.5 text-blue-400" /> MySQL Relational Database</li>
            <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400" /> Redis Distributed Locks & Cache</li>
            <li className="flex items-center gap-2"><Cpu className="w-3.5 h-3.5 text-purple-400" /> Apache Kafka Event Pipeline</li>
            <li className="flex items-center gap-2"><Server className="w-3.5 h-3.5 text-red-400" /> Node.js & Express REST APIs</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Distributed Systems</h4>
          <ul className="space-y-2 text-xs text-gray-400">
            <li>Redis TTL Seat Reservation Engine</li>
            <li>Double-Booking Race Condition Prevention</li>
            <li>Payment Webhook Signature & Idempotency</li>
            <li>Dynamic Occupancy Pricing Stored Procedure</li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Architecture Badges</h4>
          <div className="flex flex-wrap gap-1.5">
            <span className="badge badge-red">Redis TTL</span>
            <span className="badge badge-gold">Kafka Events</span>
            <span className="badge badge-purple">ACID Transactions</span>
            <span className="badge badge-green">Docker Ready</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto border-t border-slate-800 pt-6 flex flex-col md:flex-row items-center justify-between text-xs text-gray-500">
        <p>© 2026 CineWave Backend Engineering. SDE Production Portfolio Project.</p>
        <p className="font-mono">Built for High Concurrency • 1000+ RPS Load Tolerant</p>
      </div>
    </footer>
  );
};
