import React, { useEffect, useState } from 'react';
import { DollarSign, AlertTriangle, CheckCircle, Activity, Download, Calendar, Filter, RefreshCw } from 'lucide-react';
import { Stats, DateFilter, ReconciliationSession, ReconciliationRecord, TransactionStatus } from '../types';
import { DashboardService, SettingsService, ReconciliationService } from '../src/lib/firebaseServices';
import { getDateFilterWithRange } from '../src/utils/dateFilterUtils';
import { createStyledWorkbook, createStyledSheet, addMetadataSheet, exportWorkbook, identifyNumberColumns, identifyDateColumns } from '../src/utils/excelExportUtils';

// Extended type for chart display with extra UI fields
interface ChartSession extends Omit<ReconciliationSession, 'status'> {
  status: 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'EMPTY';
  dayName?: string;
  sessionCount?: number;
  isEmpty?: boolean;
  missingCount?: number; // MISSING_IN_MERCHANT + MISSING_IN_AGENT + ERROR_DUPLICATE
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalVolume: 0,
    totalTransactions: 0,
    errorCount: 0,
    matchedCount: 0
  });
  
  const [dateFilter, setDateFilter] = useState<DateFilter>(getDateFilterWithRange('day'));
  const [recentSessions, setRecentSessions] = useState<ChartSession[]>([]);
  const [loading, setLoading] = useState(true);

  // Load dashboard data
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      console.log('📊 Loading dashboard data...');
      
      const [statsData, sessionsData] = await Promise.all([
        DashboardService.getStats(dateFilter),
        DashboardService.getRecentSessions(5)
      ]);
      
      console.log('📊 Dashboard data loaded:', { statsData, sessionsData });
      
      setStats(statsData);
      
      // Load records cho mỗi session để tính chính xác stats
      const sessionsWithRealStats = await Promise.all(sessionsData.map(async (session) => {
        try {
          const records = await ReconciliationService.getRecordsBySession(session.id);
          const matchedCount = records.filter(r => r.status === TransactionStatus.MATCHED).length;
          const errorCount = records.filter(r => 
            r.status === TransactionStatus.ERROR_AMOUNT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          const missingCount = records.filter(r => 
            r.status === TransactionStatus.MISSING_IN_MERCHANT || 
            r.status === TransactionStatus.MISSING_IN_AGENT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          const totalAmount = records.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0);
          
          return {
            ...session,
            totalRecords: records.length,
            matchedCount,
            errorCount,
            missingCount,
            totalAmount
          };
        } catch (e) {
          console.warn(`⚠️ Không thể load records cho session ${session.id}:`, e);
          return session;
        }
      }));
      
      setRecentSessions(sessionsWithRealStats);
      
      // Create weekly structure: T2 → CN (Monday to Sunday)
      console.log('📊 Preparing weekly chart structure...');
      
      // Get current week's Monday to Sunday
      const now = new Date();
      const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      const monday = new Date(now);
      monday.setDate(now.getDate() - (currentDay === 0 ? 6 : currentDay - 1)); // Get this week's Monday
      
      // Create array of 7 days from Monday to Sunday
      const weekDays = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        return {
          date: date.toISOString().split('T')[0],
          dayName: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][i],
          fullDate: date
        };
      });
      
      console.log('📊 Week structure (T2-CN):', weekDays);
      
      // Map real sessions to correct weekday slots
      const chartData: ChartSession[] = [];
      for (const day of weekDays) {
        // Find real sessions for this date
        const daysSessions = sessionsData.filter(session => 
          session.createdAt && session.createdAt.split('T')[0] === day.date
        );
        
        if (daysSessions.length > 0) {
          // Load records từ tất cả sessions để tính chính xác
          const allRecords: ReconciliationRecord[] = [];
          for (const session of daysSessions) {
            try {
              const records = await ReconciliationService.getRecordsBySession(session.id);
              allRecords.push(...records);
            } catch (e) {
              console.warn(`⚠️ Không thể load records cho session ${session.id}:`, e);
            }
          }
          
          // Tính lại từ records thực tế
          const totalRecords = allRecords.length;
          const totalMatched = allRecords.filter(r => r.status === TransactionStatus.MATCHED).length;
          const totalErrors = allRecords.filter(r => 
            r.status === TransactionStatus.ERROR_AMOUNT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          const totalMissing = allRecords.filter(r => 
            r.status === TransactionStatus.MISSING_IN_MERCHANT || 
            r.status === TransactionStatus.MISSING_IN_AGENT || 
            r.status === TransactionStatus.ERROR_DUPLICATE
          ).length;
          const totalAmount = allRecords.reduce((sum, r) => sum + (r.merchantData?.amount || 0), 0);
          
          console.log('📊 Found real data for', day.dayName, day.date, { totalRecords, totalMatched, totalErrors, totalMissing, totalAmount });
          
          chartData.push({
            id: `real-${day.date}`,
            createdBy: daysSessions[0].createdBy || 'system',
            createdAt: day.fullDate.toISOString(),
            status: 'COMPLETED' as const,
            merchantFileName: `${daysSessions.length} files`,
            agentFileName: `${daysSessions.length} files`,
            totalRecords,
            matchedCount: totalMatched,
            errorCount: totalErrors,
            missingCount: totalMissing,
            totalAmount,
            dayName: day.dayName,
            sessionCount: daysSessions.length,
            isEmpty: false
          });
        } else {
          // Return empty slot for days without data
          chartData.push({
            id: `empty-${day.date}`,
            createdBy: 'system',
            createdAt: day.fullDate.toISOString(),
            status: 'EMPTY' as const,
            merchantFileName: '',
            agentFileName: '',
            totalRecords: 0,
            matchedCount: 0,
            errorCount: 0,
            totalAmount: 0,
            dayName: day.dayName,
            sessionCount: 0,
            isEmpty: true
          });
        }
      }
      
      console.log('📊 Final weekly chart:', chartData);
      setRecentSessions(chartData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [dateFilter]);

  // Export dashboard data to Excel
  const handleExport = async () => {
    try {
      const exportData = await DashboardService.exportStats(dateFilter);
      const settings = await SettingsService.getSettings();
      const workbook = createStyledWorkbook();
      
      // Thống kê tổng quan
      const statsData = [
        { 'Chi tiết': 'Tổng giao dịch', 'Giá trị': stats.totalTransactions },
        { 'Chi tiết': 'Tổng giá trị', 'Giá trị': stats.totalVolume },
        { 'Chi tiết': 'Đã khớp thành công', 'Giá trị': stats.matchedCount },
        { 'Chi tiết': 'Lỗi cần xử lý', 'Giá trị': stats.errorCount }
      ];
      const statsHeaders = ['Chi tiết', 'Giá trị'];
      const statsNumberCols = identifyNumberColumns(statsHeaders);
      createStyledSheet(workbook, 'Tổng quan', statsHeaders, statsData, {
        numberColumns: statsNumberCols.filter(i => i === 1), // Only 'Giá trị' column
        highlightTotalRow: false
      });
      
      // Phiên gần đây
      if (recentSessions.length > 0) {
        const sessionsData = recentSessions.map(session => ({
          'Ngày tạo': new Date(session.createdAt).toISOString(),
          'Tổng records': session.totalRecords,
          'Đã khớp': session.matchedCount,
          'Lỗi': session.errorCount,
          'Trạng thái': session.status === 'COMPLETED' ? 'Hoàn thành' : session.status === 'PROCESSING' ? 'Đang xử lý' : 'Lỗi'
        }));
        const sessionsHeaders = ['Ngày tạo', 'Tổng records', 'Đã khớp', 'Lỗi', 'Trạng thái'];
        const sessionsNumberCols = identifyNumberColumns(sessionsHeaders);
        const sessionsDateCols = identifyDateColumns(sessionsHeaders);
        createStyledSheet(workbook, 'Phiên gần đây', sessionsHeaders, sessionsData, {
          numberColumns: sessionsNumberCols,
          dateColumns: sessionsDateCols,
          highlightTotalRow: false
        });
      }
      
      // Add metadata
      addMetadataSheet(workbook, settings, {
        exportDate: new Date().toISOString(),
        dateRange: dateFilter.from && dateFilter.to ? `${dateFilter.from} - ${dateFilter.to}` : 'Tất cả',
        reportType: 'Báo cáo Dashboard tổng quan'
      });
      
      const fileName = `Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportWorkbook(workbook, fileName);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Có lỗi khi export dữ liệu');
    }
  };

  // Set date filter
  const setQuickFilter = (type: DateFilter['type']) => {
    setDateFilter(getDateFilterWithRange(type));
  };

  const StatCard = ({ title, value, subtext, icon: Icon, colorClass, bgClass }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all duration-300 group">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500 mb-2">{title}</p>
          <h3 className="text-3xl font-bold text-slate-900 mb-2">{value}</h3>
          <p className={`text-xs font-medium ${colorClass}`}>{subtext}</p>
        </div>
        <div className={`p-3.5 rounded-xl ${bgClass} group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`w-6 h-6 ${colorClass.replace('text-', 'text-opacity-100 text-')}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Tổng quan Dashboard</h2>
          <p className="text-slate-500">Cập nhật dữ liệu giao dịch và trạng thái đối soát real-time.</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Bộ lọc nhanh */}
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button 
              onClick={() => setQuickFilter('day')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                dateFilter.type === 'day' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Ngày
            </button>
            <button 
              onClick={() => setQuickFilter('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                dateFilter.type === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Tuần
            </button>
            <button 
              onClick={() => setQuickFilter('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                dateFilter.type === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Tháng
            </button>
          </div>
          
          {/* Nút Export */}
          <button 
            onClick={handleExport}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Statistics Cards - Focus on Key Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Tổng giá trị giao dịch"
          value={stats.totalVolume > 0 ? `${(stats.totalVolume / 1000000).toFixed(1)}M VNĐ` : "0 VNĐ"}
          subtext={loading ? "Đang tải..." : (stats.totalVolume > 0 ? `Tương đương ${stats.totalVolume.toLocaleString('vi-VN')} VNĐ` : "Chưa có dữ liệu")}
          icon={DollarSign}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <StatCard
          title="Tỷ lệ khớp thành công"
          value={stats.totalTransactions > 0 ? `${Math.round((stats.matchedCount / stats.totalTransactions) * 100)}%` : "0%"}
          subtext={loading ? "Đang tải..." : `${stats.matchedCount.toLocaleString('vi-VN')}/${stats.totalTransactions.toLocaleString('vi-VN')} giao dịch`}
          icon={CheckCircle}
          colorClass="text-emerald-600"
          bgClass="bg-emerald-50"
        />
        <StatCard
          title="Giao dịch cần xử lý"
          value={stats.errorCount.toLocaleString('vi-VN')}
          subtext={loading ? "Đang tải..." : stats.errorCount > 0 ? "⚠️ Cần kiểm tra ngay" : "✅ Tất cả đã khớp"}
          icon={AlertTriangle}
          colorClass={stats.errorCount > 0 ? "text-red-600" : "text-slate-400"}
          bgClass={stats.errorCount > 0 ? "bg-red-50" : "bg-slate-50"}
        />
        <StatCard
          title="Số lượng giao dịch"
          value={stats.totalTransactions.toLocaleString('vi-VN')}
          subtext={loading ? "Đang tải..." : "Tổng giao dịch trong kỳ"}
          icon={Activity}
          colorClass="text-blue-600"
          bgClass="bg-blue-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Biểu đồ đối soát theo tuần (T2 → CN)</h3>
            <div className="flex items-center space-x-3 text-xs">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-emerald-500 rounded"></div>
                <span className="text-slate-600">≥95%</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-slate-600">85-94%</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                <span className="text-slate-600">70-84%</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-slate-600">&lt;70%</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                <span className="text-slate-600">Nhiều phiên</span>
              </div>
            </div>
          </div>
          
          <div className="h-80 relative bg-gradient-to-b from-slate-50 to-white rounded-lg border border-slate-200">
             {loading ? (
               <div className="flex justify-center items-center w-full h-full text-slate-400">
                 <div className="text-center">
                   <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                   <p>Đang tải dữ liệu...</p>
                 </div>
               </div>
             ) : recentSessions.length > 0 ? (
               <>
                 {/* Y-axis labels */}
                 <div className="absolute left-2 top-4 bottom-16 flex flex-col justify-between text-xs text-slate-500 font-medium">
                   <span>100%</span>
                   <span>75%</span>
                   <span>50%</span>
                   <span>25%</span>
                   <span>0%</span>
                 </div>
                 
                 {/* Grid lines */}
                 <div className="absolute left-12 top-4 right-4 bottom-16">
                   {[0, 25, 50, 75, 100].map(percent => (
                     <div 
                       key={percent}
                       className="absolute w-full border-t border-slate-200"
                       style={{ top: `${100 - percent}%` }}
                     />
                   ))}
                 </div>
                 
                 {/* Weekly Chart: T2 → CN */}
                 <div className="absolute left-12 top-4 right-4 bottom-0 flex items-end justify-between gap-3">
                   {recentSessions.map((session, i) => {
                     const isEmpty = session.isEmpty || session.totalRecords === 0;
                     const percentage = isEmpty ? 0 : Math.round((session.matchedCount / Math.max(session.totalRecords, 1)) * 100);
                     const height = isEmpty ? 0 : Math.max(12, (percentage / 100) * 200);
                     
                     const barColor = isEmpty ? '' : 
                                    percentage >= 95 ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-emerald-200' : 
                                    percentage >= 85 ? 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-blue-200' : 
                                    percentage >= 70 ? 'bg-gradient-to-t from-yellow-600 to-yellow-400 shadow-yellow-200' : 
                                    'bg-gradient-to-t from-red-600 to-red-400 shadow-red-200';
                     
                     const isToday = new Date(session.createdAt).toDateString() === new Date().toDateString();
                     const isWeekend = session.dayName === 'T7' || session.dayName === 'CN';
                     
                     return (
                       <div key={session.id} className="flex-1 flex flex-col items-center group relative">
                          {/* Chart bar */}
                          <div className="relative flex items-end justify-center" style={{ height: '240px' }}>
                            {isEmpty ? (
                              // Empty day slot
                              <div className={`w-12 h-6 rounded-lg border-2 border-dashed flex items-center justify-center ${
                                isWeekend ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
                              }`}>
                                <div className="text-slate-400 text-xs font-medium">-</div>
                              </div>
                            ) : (
                              // Data bar with gradient and shadow
                              <div 
                                className={`w-12 ${barColor} rounded-t-xl transition-all duration-500 relative cursor-pointer shadow-lg hover:scale-105`}
                                style={{ height: `${height}px` }}
                              >
                                {/* Multi-session indicator */}
                                {session.sessionCount > 1 && (
                                  <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold shadow-lg">
                                    {session.sessionCount}
                                  </div>
                                )}
                                
                                {/* Percentage on top of bar */}
                                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-bold text-slate-700 bg-white px-1 rounded">
                                  {percentage}%
                                </div>
                                
                                {/* Tooltip with aggregated data */}
                                <div className="absolute -top-28 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs py-3 px-4 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap z-20 shadow-2xl border border-slate-700">
                                  <div className="text-center space-y-1">
                                    <div className="font-bold text-emerald-400">{percentage}% khớp thành công</div>
                                    <div className="text-slate-200">{session.matchedCount.toLocaleString()}/{session.totalRecords.toLocaleString()} giao dịch</div>
                                    {session.sessionCount > 1 && (
                                      <div className="text-orange-400 font-medium">{session.sessionCount} phiên đối soát</div>
                                    )}
                                    <div className="text-slate-400 text-xs">{new Date(session.createdAt).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Weekday labels */}
                          <div className="mt-3 text-center">
                            <div className={`font-bold text-lg mb-1 ${
                              isToday ? 'text-indigo-600 bg-indigo-50 rounded-lg px-2 py-1' : 
                              isWeekend ? 'text-red-600' : 
                              'text-slate-700'
                            }`}>
                              {session.dayName}
                            </div>
                            <div className="text-slate-500 text-xs font-medium">
                              {new Date(session.createdAt).getDate()}/{new Date(session.createdAt).getMonth() + 1}
                            </div>
                            {isEmpty ? (
                              <div className="text-slate-400 text-xs mt-1">Chưa có dữ liệu</div>
                            ) : (
                              <div className="text-slate-600 text-xs mt-1 font-semibold bg-slate-100 rounded px-2 py-1">
                                {session.totalRecords.toLocaleString()} GD
                              </div>
                            )}
                          </div>
                       </div>
                     )
                   })}
                 </div>
               </>
             ) : (
               <div className="flex justify-center items-center w-full h-full text-slate-400">
                 <div className="text-center">
                   <Activity className="w-8 h-8 mx-auto mb-2" />
                   <p>Chưa có dữ liệu đối soát</p>
                   <p className="text-xs mt-1">Thực hiện đối soát để xem biểu đồ</p>
                 </div>
               </div>
             )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Phiên đối soát gần đây</h3>
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-4 text-slate-400">Đang tải...</div>
            ) : recentSessions.length > 0 ? (
              recentSessions.map((session, i) => {
                // Phân biệt lỗi vs không có đối soát
                const isError = session.status === 'FAILED' || (session.status === 'COMPLETED' && session.totalRecords === 0);
                const isEmpty = session.isEmpty || (session.totalRecords === 0 && session.status === 'COMPLETED');
                
                return (
                  <div key={session.id} className="flex items-center space-x-3 pb-3 border-b border-slate-50 last:border-0">
                    <div className={`w-2 h-2 rounded-full ${
                      session.status === 'COMPLETED' && !isEmpty ? 'bg-emerald-500' :
                      session.status === 'PROCESSING' ? 'bg-yellow-500' : 
                      isError ? 'bg-red-500' : 'bg-slate-300'
                    }`}></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">
                        {isEmpty ? 'Chưa có đối soát' : `Phiên đối soát - ${session.totalRecords} giao dịch`}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(session.createdAt).toLocaleDateString('vi-VN')} • 
                        {isEmpty ? ' Không có dữ liệu' : ` ${session.matchedCount} khớp, ${session.errorCount} lỗi${session.missingCount ? `, ${session.missingCount} thiếu/trùng` : ''}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      session.status === 'COMPLETED' && !isEmpty ? 'bg-emerald-100 text-emerald-700' :
                      session.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-700' : 
                      isError ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {isEmpty ? 'Chưa có' :
                       session.status === 'COMPLETED' ? 'Hoàn thành' :
                       session.status === 'PROCESSING' ? 'Đang xử lý' : 'Lỗi'}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Chưa có phiên đối soát nào</p>
                <p className="text-xs mt-1">Hãy thực hiện đối soát đầu tiên trong tab Reconciliation</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;