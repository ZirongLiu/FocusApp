import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, SkipForward, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';

// --- 辅助函数 ---
const TIME_SLOTS = ['morning', 'afternoon', 'evening'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatDuration = (minutes) => {
  if (minutes === 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatTimer = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const AMBIENT_SOUND_URL = "https://actions.google.com/sounds/v1/weather/rain_heavy_loud.ogg";

export default function App() {
  const [activeTab, setActiveTab] = useState('controls'); 
  
  const [timerStatus, setTimerStatus] = useState('idle'); 
  const [selectedDuration, setSelectedDuration] = useState(25); 
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('focus_history');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('focus_history', JSON.stringify(history));
  }, [history]);

  // ✅ 核心逻辑更新：添加系统通知
  useEffect(() => {
    let interval;
    if (timerStatus === 'running' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerStatus === 'running') {
      setTimerStatus('idle');
      setTimeLeft(selectedDuration * 60);
      addSessionToHistory(selectedDuration);
      
      // 1. 播放声音
      new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(e=>{});
      
      // 2. 发送系统通知 (New!)
      sendNotification(selectedDuration);
    }
    return () => clearInterval(interval);
  }, [timerStatus, timeLeft, selectedDuration]);

  // ✅ 通知发送函数
  const sendNotification = (minutes) => {
    // 检查浏览器是否支持通知
    if (!("Notification" in window)) return;

    const title = "专注完成！🎉";
    const options = {
      body: `太棒了！您已经专注了 ${minutes} 分钟。休息一下吧！`,
      silent: true // 系统通知静音，因为我们已经手动播放了提示音
    };

    if (Notification.permission === "granted") {
      new Notification(title, options);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(title, options);
        }
      });
    }
  };

  useEffect(() => {
    if (timerStatus === 'idle') {
      setTimeLeft(selectedDuration * 60);
    }
  }, [selectedDuration, timerStatus]);

  useEffect(() => {
    if (audioRef.current) {
      if (timerStatus === 'running') {
        audioRef.current.play().catch(e => console.log("Audio play blocked", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [timerStatus]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  const addSessionToHistory = (durationMinutes) => {
    const newSession = {
      id: Date.now(),
      timestamp: Date.now(),
      duration: durationMinutes,
    };
    setHistory(prev => [...prev, newSession]);
  };

  const handleQuit = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  const currentSessionProgress = timerStatus !== 'idle' 
    ? (selectedDuration * 60 - timeLeft) / 60 
    : 0;

  return (
    <div className="h-screen w-screen bg-black/80 backdrop-blur-xl flex flex-col overflow-hidden text-white font-sans selection:bg-green-500 selection:text-white border border-white/10 rounded-[10px]">
      
      <audio ref={audioRef} src={AMBIENT_SOUND_URL} loop />

      <div className="absolute top-0 left-0 w-full h-6 z-50" style={{ WebkitAppRegion: 'drag' }}></div>

      <header className="flex items-center justify-between px-5 pt-5 pb-2 text-xs font-medium text-gray-400 z-10">
        <div className="flex gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
          <button 
            onClick={() => setActiveTab('controls')}
            className={`transition-colors hover:text-white ${activeTab === 'controls' ? 'text-white' : ''}`}
          >
            Controls
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`transition-colors hover:text-white ${activeTab === 'stats' ? 'text-white' : ''}`}
          >
            Stats
          </button>
        </div>
        <button onClick={handleQuit} className="hover:text-white transition-colors" style={{ WebkitAppRegion: 'no-drag' }}>
            Quit
        </button>
      </header>

      <div className="flex-1 relative z-10">
        {activeTab === 'controls' ? (
          <ControlsView 
            status={timerStatus}
            setStatus={setTimerStatus}
            timeLeft={timeLeft}
            setTimeLeft={setTimeLeft}
            selectedDuration={selectedDuration}
            setSelectedDuration={setSelectedDuration}
            volume={volume}
            setVolume={setVolume}
            isMuted={isMuted}
            setIsMuted={setIsMuted}
          />
        ) : (
          <StatsView 
            history={history} 
            liveProgress={currentSessionProgress} 
          />
        )}
      </div>
    </div>
  );
}

function StatsView({ history, liveProgress }) {
  const [hoveredCell, setHoveredCell] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const startOfSelectedWeek = getStartOfWeek(currentDate);
  const endOfSelectedWeek = new Date(startOfSelectedWeek);
  endOfSelectedWeek.setDate(endOfSelectedWeek.getDate() + 7);

  const weeklySessions = history.filter(session => {
    const date = new Date(session.timestamp);
    return date >= startOfSelectedWeek && date < endOfSelectedWeek;
  });

  const weekDataGrid = {
    Mon: { morning: 0, afternoon: 0, evening: 0 },
    Tue: { morning: 0, afternoon: 0, evening: 0 },
    Wed: { morning: 0, afternoon: 0, evening: 0 },
    Thu: { morning: 0, afternoon: 0, evening: 0 },
    Fri: { morning: 0, afternoon: 0, evening: 0 },
    Sat: { morning: 0, afternoon: 0, evening: 0 },
    Sun: { morning: 0, afternoon: 0, evening: 0 },
  };

  let totalWeekMinutes = 0;

  weeklySessions.forEach(session => {
    const date = new Date(session.timestamp);
    const dayIndex = date.getDay(); 
    const hours = date.getHours();
    const dayKey = dayIndex === 0 ? 'Sun' : DAYS[dayIndex - 1];

    let slot = 'evening';
    if (hours >= 4 && hours < 12) slot = 'morning';
    else if (hours >= 12 && hours < 17) slot = 'afternoon';

    weekDataGrid[dayKey][slot] += session.duration;
    totalWeekMinutes += session.duration;
  });

  const isCurrentWeek = new Date() >= startOfSelectedWeek && new Date() < endOfSelectedWeek;
  if (isCurrentWeek && liveProgress > 0) {
    const now = new Date();
    const currentDayIndex = now.getDay();
    const currentHour = now.getHours();
    const currentDayKey = currentDayIndex === 0 ? 'Sun' : DAYS[currentDayIndex - 1];
    
    let currentSlot = 'evening';
    if (currentHour >= 4 && currentHour < 12) currentSlot = 'morning';
    else if (currentHour >= 12 && currentHour < 17) currentSlot = 'afternoon';

    totalWeekMinutes += liveProgress;
    if (weekDataGrid[currentDayKey]) {
      weekDataGrid[currentDayKey][currentSlot] += liveProgress;
    }
  }

  const displayTitle = hoveredCell 
    ? `${hoveredCell.day} • ${hoveredCell.slot.toUpperCase()}`
    : "TOTAL FOCUS";
  
  const displayValue = hoveredCell
    ? formatDuration(hoveredCell.val)
    : formatDuration(totalWeekMinutes);

  const formatDate = (d) => `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;

  const prevWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  
  const nextWeek = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  return (
    <div className="h-full flex flex-col px-5 pt-2 pb-5 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-center gap-4 text-gray-400 text-[10px] mb-4">
        <button onClick={prevWeek} className="hover:text-white transition-colors"><ChevronLeft size={12} /></button>
        <span className="font-medium tracking-wide text-gray-300">
          {formatDate(startOfSelectedWeek)} - {formatDate(new Date(endOfSelectedWeek.getTime() - 86400000))}
        </span>
        <button onClick={nextWeek} className="hover:text-white transition-colors"><ChevronRight size={12} /></button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-[80px] mb-2">
        <div className="text-[9px] font-bold tracking-widest text-gray-500 uppercase mb-1 transition-all duration-200">
          {displayTitle}
        </div>
        <div className="text-4xl font-bold tracking-tight text-white transition-all duration-200">
          {displayValue}
        </div>
      </div>

      <div className="mt-auto">
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {DAYS.map((day) => (
            <div key={day} className="flex flex-col gap-1.5">
              {TIME_SLOTS.map((slot) => {
                const val = weekDataGrid[day][slot];
                
                let bgColor = 'bg-white/10'; 
                if (val > 0) bgColor = 'bg-emerald-500/40';
                if (val >= 25) bgColor = 'bg-emerald-500/70';
                if (val >= 50) bgColor = 'bg-emerald-400'; 

                return (
                  <div
                    key={slot}
                    className={`w-full aspect-square rounded-sm cursor-pointer transition-all duration-200 ${bgColor} hover:scale-110 hover:brightness-110 ring-0 hover:ring-1 ring-emerald-500/50`}
                    onMouseEnter={() => setHoveredCell({ day: day.toUpperCase(), slot, val })}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center">
          {DAYS.map(day => (
            <span key={day} className="text-[9px] text-gray-500 font-medium">{day}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ControlsView({ status, setStatus, timeLeft, setTimeLeft, selectedDuration, setSelectedDuration, volume, setVolume, isMuted, setIsMuted }) {
  const handleStart = () => {
    // 请求通知权限
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    setStatus('running');
  };
  
  const handlePause = () => setStatus(status === 'running' ? 'paused' : 'running');
  const handleStop = () => {
    setStatus('idle');
    setTimeLeft(selectedDuration * 60);
  };

  const handleSkip = () => {
    setTimeLeft(0);
  };

  const handleDurationClick = (index) => {
    if (status === 'idle') {
      setSelectedDuration((index + 1) * 25);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-between px-5 py-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="text-center mt-2">
        <h2 className={`text-[10px] font-bold tracking-[0.2em] uppercase mb-2 transition-colors duration-300 ${status === 'running' ? 'text-orange-400' : 'text-emerald-400'}`}>
          {status === 'running' ? 'Deep Focus' : 'Ready to Flow'}
        </h2>
        <div className="text-6xl font-medium tracking-tighter tabular-nums">
          {formatTimer(timeLeft)}
        </div>
      </div>

      <div className="flex gap-1.5 mt-4 w-full justify-center h-3 items-center">
        {[0, 1, 2, 3].map((index) => {
          const isActive = ((index + 1) * 25) <= selectedDuration;
          return (
            <button
              key={index}
              onClick={() => handleDurationClick(index)}
              disabled={status !== 'idle'}
              className={`w-6 h-1 rounded-full transition-all duration-300 ${
                isActive ? 'bg-orange-500' : 'bg-white/10'
              } ${status === 'idle' ? 'hover:scale-y-150 hover:bg-orange-400 cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              title={`${(index + 1) * 25} Minutes`}
            />
          );
        })}
      </div>

      <div className="w-full mt-auto mb-2">
        {status === 'idle' ? (
          <button 
            onClick={handleStart}
            className="w-full bg-white text-black h-12 rounded-xl flex items-center justify-center gap-2 font-bold text-base hover:bg-gray-100 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
          >
            <Play size={18} fill="black" />
            Start Focus
          </button>
        ) : (
          <div className="flex items-center justify-center gap-5">
            <button 
              onClick={handleStop}
              className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-90"
            >
              <Square size={16} fill="currentColor" />
            </button>

            <button 
              onClick={handlePause}
              className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              {status === 'running' ? (
                <Pause size={24} fill="black" />
              ) : (
                <Play size={24} fill="black" className="ml-1" />
              )}
            </button>

            <button 
              onClick={handleSkip}
              className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-all active:scale-90"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          </div>
        )}
      </div>

      <div className="w-full flex items-center gap-3 px-1 group">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="hover:text-white transition-colors outline-none"
        >
           {isMuted ? (
             <VolumeX size={14} className="text-gray-500 group-hover:text-gray-300" />
           ) : (
             <Volume2 size={14} className="text-gray-500 group-hover:text-gray-300" />
           )}
        </button>
        
        <div className="relative flex-1 h-1 bg-white/10 rounded-full overflow-hidden cursor-pointer group">
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume} 
            onChange={(e) => {
              setVolume(e.target.value);
              if (isMuted) setIsMuted(false);
            }}
            className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
          />
          <div 
            className="h-full bg-gray-500 group-hover:bg-gray-300 transition-all rounded-full"
            style={{ width: `${isMuted ? 0 : volume}%` }}
          />
        </div>
      </div>
      
    </div>
  );
}