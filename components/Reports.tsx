import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, DollarSign, Users, AlertCircle, Search, Calendar, FileText, Building2, CreditCard, BarChart3, Filter } from 'lucide-react';
import { DebtReport, DebtByAdminAccount, DateFilter, Agent, Merchant } from '../types';
import { useRealtimeData, FirebaseUtils } from '../src/lib/firebaseHooks';
import { ReportsService } from '../src/lib/firebaseServices';
import { getDateFilterWithRange } from '../src/utils/dateFilterUtils';
import { createStyledWorkbook, createStyledSheet, addMetadataSheet, exportWorkbook, identifyNumberColumns, identifyDateColumns } from '../src/utils/excelExportUtils';
import { SettingsService } from '../src/lib/firebaseServices';

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'debt-agent' | 'debt-admin'>('debt-agent');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>(getDateFilterWithRange('month'));
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [debtReports, setDebtReports] = useState<DebtReport[]>([]);
  const [debtByAdmin, setDebtByAdmin] = useState<DebtByAdminAccount[]>([]);
  
  // Firebase data
  const { data: agentsData } = useRealtimeData<Record<string, Agent>>('/agents');
  const { data: merchantsData } = useRealtimeData<Record<string, Merchant>>('/merchants');
  
  const agents = FirebaseUtils.objectToArray(agentsData || {});
  const merchants = FirebaseUtils.objectToArray(merchantsData || {});

  // Load reports data - UI first, then data
  useEffect(() => {
    // Load UI immediately (skeleton will show)
    setLoading(true);
    
    // Load data asynchronously
    loadReportsData();
  }, [dateFilter]);

  const loadReportsData = async () => {
    try {
      const [debtByAgent, debtByAdminAcc] = await Promise.all([
        ReportsService.getDebtReportByAgent(dateFilter),
        ReportsService.getDebtReportByAdminAccount(dateFilter)
      ]);
      
      setDebtReports(debtByAgent);
      setDebtByAdmin(debtByAdminAcc);
    } catch (error) {
      console.error('Error loading reports:', error);
      alert('Có lỗi khi tải dữ liệu báo cáo. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  // Export functions
  const handleExportDebtReport = async () => {
    try {
      const workbook = createStyledWorkbook();
      const settings = await SettingsService.getSettings();
      
      // Prepare data
      const data = debtReports.map(report => ({
        'Đại lý': report.agentName,
        'Mã đại lý': report.agentCode,
        'Điểm thu': report.pointOfSales?.join(', ') || 'N/A',
        'Tổng GD': report.totalTransactions,
        'Tổng tiền': report.totalAmount,
        'Phí': report.totalFee,
        'Thực trả': report.netAmount,
        'Đã thanh toán': report.paidAmount,
        'Còn nợ': report.unpaidAmount
      }));
      
      const headers = ['Đại lý', 'Mã đại lý', 'Điểm thu', 'Tổng GD', 'Tổng tiền', 'Phí', 'Thực trả', 'Đã thanh toán', 'Còn nợ'];
      const numberColumns = identifyNumberColumns(headers);
      
      // Create styled sheet
      createStyledSheet(workbook, 'Công nợ theo đại lý', headers, data, {
        numberColumns,
        highlightTotalRow: false
      });
      
      // Add metadata
      addMetadataSheet(workbook, settings, {
        exportDate: new Date().toISOString(),
        dateRange: dateFilter.from && dateFilter.to ? `${dateFilter.from} - ${dateFilter.to}` : 'Tất cả',
        reportType: 'Báo cáo công nợ theo đại lý'
      });
      
      const fileName = `Bao_cao_cong_no_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportWorkbook(workbook, fileName);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Có lỗi khi export dữ liệu');
    }
  };

  const handleExportAdminDebt = async () => {
    try {
      const workbook = createStyledWorkbook();
      const settings = await SettingsService.getSettings();
      
      // Flatten data for Excel
      const rows: any[] = [];
      debtByAdmin.forEach(adminAcc => {
        adminAcc.merchants.forEach((merchant, index) => {
          rows.push({
            'STK Admin': index === 0 ? adminAcc.adminAccount : '',
            'Tổng STK': index === 0 ? adminAcc.totalAmount : '',
            'Điểm bán': merchant.merchantName,
            'Mã điểm bán': merchant.merchantCode,
            'Điểm thu': merchant.pointOfSaleName || (merchant.pointOfSales?.join(', ') || 'N/A'),
            'Số tiền': merchant.totalAmount,
            'Số GD': merchant.transactionCount
          });
        });
      });
      
      const headers = ['STK Admin', 'Tổng STK', 'Điểm bán', 'Mã điểm bán', 'Điểm thu', 'Số tiền', 'Số GD'];
      const numberColumns = identifyNumberColumns(headers);
      
      // Create styled sheet
      createStyledSheet(workbook, 'Công nợ theo STK Admin', headers, rows, {
        numberColumns,
        highlightTotalRow: false
      });
      
      // Add metadata
      addMetadataSheet(workbook, settings, {
        exportDate: new Date().toISOString(),
        dateRange: dateFilter.from && dateFilter.to ? `${dateFilter.from} - ${dateFilter.to}` : 'Tất cả',
        reportType: 'Báo cáo công nợ theo STK Admin'
      });
      
      const fileName = `Cong_no_theo_STK_${new Date().toISOString().split('T')[0]}.xlsx`;
      exportWorkbook(workbook, fileName);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Có lỗi khi export dữ liệu');
    }
  };

  // Quick date filters
  const setQuickFilter = (type: DateFilter['type']) => {
    setDateFilter(getDateFilterWithRange(type));
  };

  // Filter by search
  const filteredDebtReports = debtReports.filter(report =>
    report.agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.agentCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAdminDebt = debtByAdmin.filter(admin =>
    admin.adminAccount.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Skeleton loading component
  const SkeletonTable = () => (
    <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200 animate-pulse">
      <div className="p-4 border-b border-slate-200">
        <div className="h-4 w-32 bg-slate-200 rounded"></div>
      </div>
      <div className="divide-y divide-slate-100">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 flex items-center space-x-4">
            <div className="h-4 w-24 bg-slate-200 rounded flex-1"></div>
            <div className="h-4 w-16 bg-slate-200 rounded"></div>
            <div className="h-4 w-20 bg-slate-200 rounded"></div>
            <div className="h-4 w-20 bg-slate-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Báo cáo Công nợ & Giao dịch</h2>
          <p className="text-slate-500">Theo dõi công nợ và giao dịch chi tiết</p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Date Filter */}
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
          
          {/* Export Button */}
          <button
            onClick={activeTab === 'debt-agent' ? handleExportDebtReport : handleExportAdminDebt}
            className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('debt-agent')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'debt-agent' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Công nợ theo Đại lý
        </button>
        <button
          onClick={() => setActiveTab('debt-admin')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'debt-admin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4 inline mr-2" />
          Công nợ theo STK Admin
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
          placeholder="Tìm kiếm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Content */}
      {activeTab === 'debt-agent' && (
        <div className="space-y-4">
          {loading ? (
            <>
              {/* Skeleton Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-pulse">
                    <div className="h-4 w-24 bg-slate-200 rounded mb-2"></div>
                    <div className="h-8 w-32 bg-slate-200 rounded mb-1"></div>
                    <div className="h-3 w-20 bg-slate-200 rounded"></div>
                  </div>
                ))}
              </div>
              <SkeletonTable />
            </>
          ) : (
            <>
              {/* Summary Cards - Key Financial Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Tổng công nợ</p>
                  <p className="text-2xl font-bold text-red-600">
                    {(() => {
                      const total = debtReports.reduce((sum, r) => sum + r.unpaidAmount, 0);
                      return total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total.toLocaleString('vi-VN');
                    })()} đ
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {debtReports.filter(r => r.unpaidAmount > 0).length} đại lý còn nợ
                  </p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <DollarSign className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Đã thanh toán</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {(() => {
                      const total = debtReports.reduce((sum, r) => sum + r.paidAmount, 0);
                      return total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total.toLocaleString('vi-VN');
                    })()} đ
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {debtReports.filter(r => r.paidAmount > 0).length} đại lý đã thanh toán
                  </p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Tổng giá trị</p>
                  <p className="text-2xl font-bold text-slate-800">
                    {(() => {
                      const total = debtReports.reduce((sum, r) => sum + r.totalAmount, 0);
                      return total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total.toLocaleString('vi-VN');
                    })()} đ
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {debtReports.reduce((sum, r) => sum + r.totalTransactions, 0).toLocaleString('vi-VN')} giao dịch
                  </p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 mb-1">Tổng phí thu được</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {(() => {
                      const total = debtReports.reduce((sum, r) => sum + r.totalFee, 0);
                      return total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total.toLocaleString('vi-VN');
                    })()} đ
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {debtReports.length} đại lý
                  </p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                  <DollarSign className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Debt Table */}
          <div className="bg-white rounded-xl shadow-md overflow-hidden border border-slate-200">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 text-left font-bold">Đại lý</th>
                  <th className="p-4 text-left font-bold">Điểm thu</th>
                  <th className="p-4 text-center font-bold">Tổng GD</th>
                  <th className="p-4 text-right font-bold">Tổng tiền</th>
                  <th className="p-4 text-right font-bold">Phí</th>
                  <th className="p-4 text-right font-bold">Thực trả</th>
                  <th className="p-4 text-right font-bold">Đã TT</th>
                  <th className="p-4 text-right font-bold">Còn nợ</th>
                  <th className="p-4 text-left font-bold">GD cuối</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredDebtReports.length > 0 ? (
                  filteredDebtReports.map((report, index) => (
                    <tr key={report.id} className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="p-4">
                        <div className="font-medium text-slate-800">{report.agentName}</div>
                        <div className="text-xs text-slate-500 font-mono">{report.agentCode}</div>
                      </td>
                      <td className="p-4">
                        {report.pointOfSales && report.pointOfSales.length > 0 ? (
                          <div className="space-y-1">
                            {report.pointOfSales.slice(0, 2).map((pos, idx) => (
                              <div key={idx} className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {pos}
                              </div>
                            ))}
                            {report.pointOfSales.length > 2 && (
                              <div className="text-xs text-slate-400">
                                +{report.pointOfSales.length - 2} điểm thu khác
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">N/A</span>
                        )}
                      </td>
                      <td className="p-4 text-center">{report.totalTransactions}</td>
                      <td className="p-4 text-right font-medium">{report.totalAmount.toLocaleString('vi-VN')} đ</td>
                      <td className="p-4 text-right text-red-600">-{report.totalFee.toLocaleString('vi-VN')} đ</td>
                      <td className="p-4 text-right font-bold">{report.netAmount.toLocaleString('vi-VN')} đ</td>
                      <td className="p-4 text-right text-emerald-600">{report.paidAmount.toLocaleString('vi-VN')} đ</td>
                      <td className="p-4 text-right">
                        <span className={`font-bold ${report.unpaidAmount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {report.unpaidAmount.toLocaleString('vi-VN')} đ
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {report.lastTransactionDate ? new Date(report.lastTransactionDate).toLocaleDateString('vi-VN') : 'N/A'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>Không có dữ liệu công nợ</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'debt-admin' && (
        <div className="space-y-4">
          {loading ? (
            <>
              <SkeletonTable />
              <SkeletonTable />
            </>
          ) : filteredAdminDebt.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Không có dữ liệu công nợ theo STK Admin</p>
            </div>
          ) : (
            filteredAdminDebt.map((adminAcc) => (
            <div key={adminAcc.adminAccount} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 p-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <CreditCard className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">STK Admin: {adminAcc.adminAccount}</h3>
                      <p className="text-sm text-slate-500">{adminAcc.merchants.length} điểm bán • {adminAcc.totalTransactions} giao dịch</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-800">{adminAcc.totalAmount.toLocaleString('vi-VN')} đ</p>
                    <p className="text-sm text-slate-500">Tổng công nợ</p>
                  </div>
                </div>
              </div>
              
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="p-3 text-left font-semibold">Điểm bán</th>
                    <th className="p-3 text-left font-semibold">Điểm thu</th>
                    <th className="p-3 text-center font-semibold">Số GD</th>
                    <th className="p-3 text-right font-semibold">Tổng tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {adminAcc.merchants.map((merchant) => (
                    <tr key={merchant.merchantId} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{merchant.merchantName}</div>
                        <div className="text-xs text-slate-500 font-mono">{merchant.merchantCode}</div>
                      </td>
                      <td className="p-3">
                        {merchant.pointOfSaleName ? (
                          <div className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200 inline-block">
                            {merchant.pointOfSaleName}
                          </div>
                        ) : merchant.pointOfSales && merchant.pointOfSales.length > 0 ? (
                          <div className="space-y-1">
                            {merchant.pointOfSales.slice(0, 2).map((pos, idx) => (
                              <div key={idx} className="text-xs font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {pos}
                              </div>
                            ))}
                            {merchant.pointOfSales.length > 2 && (
                              <div className="text-xs text-slate-400">
                                +{merchant.pointOfSales.length - 2} điểm thu khác
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">N/A</span>
                        )}
                      </td>
                      <td className="p-3 text-center">{merchant.transactionCount}</td>
                      <td className="p-3 text-right font-medium">{merchant.totalAmount.toLocaleString('vi-VN')} đ</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ))
          )}
        </div>
      )}

    </div>
  );
};

export default Reports;

