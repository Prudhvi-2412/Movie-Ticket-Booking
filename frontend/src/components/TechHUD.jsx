import React, { useState, useEffect } from 'react';
import { Lock, Cpu, Database, Activity } from 'lucide-react';

export const TechHUD = () => {
  const [activeNode, setActiveNode] = useState('redis');
  const [lockTimer, setLockTimer] = useState(599);
  const [kafkaRps, setKafkaRps] = useState(1450);

  useEffect(() => {
    const timer = setInterval(() => {
      setLockTimer(prev => (prev > 1 ? prev - 1 : 600));
      setKafkaRps(1420 + Math.floor(Math.random() * 60));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="glass-slate-card p-6 mb-12 border border-[#FF0055]/30 bg-gradient-to-r from-[#161B22] via-[#21262D] to-[#161B22] relative overflow-hidden">
      
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
        
        {/* Title Badge & LED Indicator */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF0055]/15 border border-[#FF0055]/40 flex items-center justify-center shadow-crimson-glow">
            <Activity className="w-6 h-6 text-[#FF0055] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-[#FF0055]">DISTRIBUTED TELEMETRY HUD</span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] shadow-cyan-glow animate-ping"></span>
            </div>
            <h3 className="text-lg font-black text-white">Event Mesh & Redis Lock Engine Overview</h3>
          </div>
        </div>

        {/* Tech Nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full lg:w-auto">
          
          {/* Node 1: Redis TTL Lock */}
          <div
            onMouseEnter={() => setActiveNode('redis')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
              activeNode === 'redis'
                ? 'bg-[#FF0055]/15 border-[#FF0055] shadow-crimson-glow'
                : 'bg-[#0D1117]/60 border-[#30363D]'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-[#FFD700]/20 border border-[#FFD700]/40 flex items-center justify-center">
              <Lock className="w-4 h-4 text-[#FFD700]" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#8B949E] block">Redis TTL Lock</span>
              <span className="text-xs font-mono font-bold text-[#FFD700]">{formatTimer(lockTimer)} TTL Active</span>
            </div>
          </div>

          {/* Node 2: Kafka Pipeline */}
          <div
            onMouseEnter={() => setActiveNode('kafka')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
              activeNode === 'kafka'
                ? 'bg-[#FF0055]/15 border-[#FF0055] shadow-crimson-glow'
                : 'bg-[#0D1117]/60 border-[#30363D]'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-[#00E5FF]/20 border border-[#00E5FF]/40 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-[#00E5FF]" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#8B949E] block">Kafka Event Bus</span>
              <span className="text-xs font-mono font-bold text-[#00E5FF]">{kafkaRps} msgs/sec</span>
            </div>
          </div>

          {/* Node 3: MySQL ACID */}
          <div
            onMouseEnter={() => setActiveNode('mysql')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
              activeNode === 'mysql'
                ? 'bg-[#FF0055]/15 border-[#FF0055] shadow-crimson-glow'
                : 'bg-[#0D1117]/60 border-[#30363D]'
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-[#00F5A0]/20 border border-[#00F5A0]/40 flex items-center justify-center">
              <Database className="w-4 h-4 text-[#00F5A0]" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-[#8B949E] block">MySQL Partition</span>
              <span className="text-xs font-mono font-bold text-[#00F5A0]">ACID Guaranteed</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
