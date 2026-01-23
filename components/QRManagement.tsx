import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Search, QrCode, Package, ChevronDown, ChevronUp, Save, X, AlertCircle } from 'lucide-react';
import { QRMasterData, QRProduct } from '../types';
import { QRMasterService, QRProductService } from '../src/lib/qrServices';

const QRManagement: React.FC = () => {
    // State
    const [activeTab, setActiveTab] = useState<'masters' | 'products'>('masters');
    const [masters, setMasters] = useState<QRMasterData[]>([]);
    const [products, setProducts] = useState<QRProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal states
    const [showMasterModal, setShowMasterModal] = useState(false);
    const [showProductModal, setShowProductModal] = useState(false);
    const [editingMaster, setEditingMaster] = useState<QRMasterData | null>(null);
    const [editingProduct, setEditingProduct] = useState<QRProduct | null>(null);

    // Expanded rows for products
    const [expandedMasterId, setExpandedMasterId] = useState<string | null>(null);

    // Form states
    const [masterForm, setMasterForm] = useState({
        mid: '',
        midLabel: '',
        beneficiaryName: '',
        pointOfSale: '',
        accountNumber: '',
        bankCode: '',
        mcc: '',
        merchantCity: '',
        postalCode: '',
        isActive: true,
    });

    const [productForm, setProductForm] = useState({
        masterId: '',
        productName: '',
        productCode: '',
        defaultAmount: '',
        isActive: true,
    });

    // Load data
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [mastersData, productsData] = await Promise.all([
                QRMasterService.listMasters(),
                QRProductService.listProducts(),
            ]);
            setMasters(mastersData);
            setProducts(productsData);
        } catch (error) {
            console.error('Error loading QR data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Master CRUD
    const handleSaveMaster = async () => {
        try {
            if (editingMaster) {
                await QRMasterService.updateMaster(editingMaster.id, masterForm);
            } else {
                await QRMasterService.addMaster(masterForm);
            }
            await loadData();
            closeMasterModal();
        } catch (error) {
            console.error('Error saving master:', error);
            alert('Có lỗi khi lưu dữ liệu');
        }
    };

    const handleDeleteMaster = async (id: string) => {
        if (!window.confirm('Xóa MID này sẽ xóa luôn tất cả sản phẩm liên quan. Bạn có chắc chắn?')) return;
        try {
            await QRMasterService.deleteMaster(id);
            await loadData();
        } catch (error) {
            console.error('Error deleting master:', error);
            alert('Có lỗi khi xóa');
        }
    };

    const openMasterModal = (master?: QRMasterData) => {
        if (master) {
            setEditingMaster(master);
            setMasterForm({
                mid: master.mid,
                midLabel: master.midLabel,
                beneficiaryName: master.beneficiaryName,
                pointOfSale: master.pointOfSale,
                accountNumber: master.accountNumber,
                bankCode: master.bankCode || '',
                mcc: master.mcc,
                merchantCity: master.merchantCity || '',
                postalCode: master.postalCode || '',
                isActive: master.isActive,
            });
        } else {
            setEditingMaster(null);
            setMasterForm({
                mid: '',
                midLabel: '',
                beneficiaryName: '',
                pointOfSale: '',
                accountNumber: '',
                bankCode: '',
                mcc: '',
                merchantCity: '',
                postalCode: '',
                isActive: true,
            });
        }
        setShowMasterModal(true);
    };

    const closeMasterModal = () => {
        setShowMasterModal(false);
        setEditingMaster(null);
    };

    // Product CRUD
    const handleSaveProduct = async () => {
        try {
            const data = {
                ...productForm,
                defaultAmount: productForm.defaultAmount ? parseFloat(productForm.defaultAmount) : undefined,
            };
            if (editingProduct) {
                await QRProductService.updateProduct(editingProduct.id, data);
            } else {
                await QRProductService.addProduct(data as any);
            }
            await loadData();
            closeProductModal();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Có lỗi khi lưu sản phẩm');
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) return;
        try {
            await QRProductService.deleteProduct(id);
            await loadData();
        } catch (error) {
            console.error('Error deleting product:', error);
            alert('Có lỗi khi xóa');
        }
    };

    const openProductModal = (masterId: string, product?: QRProduct) => {
        if (product) {
            setEditingProduct(product);
            setProductForm({
                masterId: product.masterId,
                productName: product.productName,
                productCode: product.productCode,
                defaultAmount: product.defaultAmount?.toString() || '',
                isActive: product.isActive,
            });
        } else {
            setEditingProduct(null);
            setProductForm({
                masterId: masterId,
                productName: '',
                productCode: '',
                defaultAmount: '',
                isActive: true,
            });
        }
        setShowProductModal(true);
    };

    const closeProductModal = () => {
        setShowProductModal(false);
        setEditingProduct(null);
    };

    // Filter
    const filteredMasters = masters.filter(m =>
        m.mid.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.midLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.beneficiaryName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getProductsForMaster = (masterId: string) => {
        return products.filter(p => p.masterId === masterId);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-slate-500">Đang tải dữ liệu...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <QrCode className="w-7 h-7 text-indigo-600" />
                        Quản lý QR Code
                    </h2>
                    <p className="text-slate-500">Quản lý dữ liệu master và sản phẩm để sinh mã QR</p>
                </div>

                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm MID, đơn vị..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-64"
                        />
                    </div>
                    <button
                        onClick={() => openMasterModal()}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Thêm MID
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-2xl font-bold text-indigo-600">{masters.length}</div>
                    <div className="text-sm text-slate-500">Tổng MID</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-2xl font-bold text-emerald-600">{masters.filter(m => m.isActive).length}</div>
                    <div className="text-sm text-slate-500">MID đang hoạt động</div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="text-2xl font-bold text-purple-600">{products.length}</div>
                    <div className="text-sm text-slate-500">Tổng sản phẩm</div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase w-10"></th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">MID</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Đơn vị thụ hưởng</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Điểm bán</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">MCC</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Số TK</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Trạng thái</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">SP</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredMasters.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                                        {searchTerm ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu MID. Bấm "Thêm MID" để bắt đầu.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredMasters.map((master) => {
                                    const masterProducts = getProductsForMaster(master.id);
                                    const isExpanded = expandedMasterId === master.id;

                                    return (
                                        <React.Fragment key={master.id}>
                                            <tr className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => setExpandedMasterId(isExpanded ? null : master.id)}
                                                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronUp className="w-4 h-4 text-slate-500" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4 text-slate-500" />
                                                        )}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-slate-800">{master.mid}</div>
                                                    <div className="text-xs text-slate-500">{master.midLabel}</div>
                                                </td>
                                                <td className="px-4 py-3 text-slate-700">{master.beneficiaryName}</td>
                                                <td className="px-4 py-3 text-slate-700">{master.pointOfSale}</td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                                                        {master.mcc}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 font-mono text-sm">{master.accountNumber}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${master.isActive
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                        {master.isActive ? 'Hoạt động' : 'Tắt'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                                        {masterProducts.length} SP
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => openProductModal(master.id)}
                                                            className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                            title="Thêm sản phẩm"
                                                        >
                                                            <Package className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => openMasterModal(master)}
                                                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="Sửa"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMaster(master.id)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Xóa"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded products row */}
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={9} className="bg-slate-50 px-4 py-4">
                                                        <div className="ml-8">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <h4 className="font-medium text-slate-700 flex items-center gap-2">
                                                                    <Package className="w-4 h-4" />
                                                                    Sản phẩm của {master.midLabel}
                                                                </h4>
                                                                <button
                                                                    onClick={() => openProductModal(master.id)}
                                                                    className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                                                                >
                                                                    <Plus className="w-3 h-3" />
                                                                    Thêm SP
                                                                </button>
                                                            </div>

                                                            {masterProducts.length === 0 ? (
                                                                <div className="text-sm text-slate-500 py-4">
                                                                    Chưa có sản phẩm nào
                                                                </div>
                                                            ) : (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                    {masterProducts.map(product => (
                                                                        <div
                                                                            key={product.id}
                                                                            className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center"
                                                                        >
                                                                            <div>
                                                                                <div className="font-medium text-slate-800">{product.productName}</div>
                                                                                <div className="text-xs text-slate-500">
                                                                                    Mã: {product.productCode}
                                                                                    {product.defaultAmount && ` • ${product.defaultAmount.toLocaleString()}đ`}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-1">
                                                                                <button
                                                                                    onClick={() => openProductModal(master.id, product)}
                                                                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                                                                                >
                                                                                    <Edit2 className="w-3 h-3" />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDeleteProduct(product.id)}
                                                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                                                >
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Master Modal */}
            {showMasterModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800">
                                {editingMaster ? 'Sửa MID' : 'Thêm MID mới'}
                            </h3>
                            <button onClick={closeMasterModal} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">MID *</label>
                                    <input
                                        type="text"
                                        value={masterForm.mid}
                                        onChange={(e) => setMasterForm({ ...masterForm, mid: e.target.value })}
                                        placeholder="VD: MID001"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Tên hiển thị *</label>
                                    <input
                                        type="text"
                                        value={masterForm.midLabel}
                                        onChange={(e) => setMasterForm({ ...masterForm, midLabel: e.target.value })}
                                        placeholder="VD: BACHHOATHANH"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị thụ hưởng *</label>
                                <input
                                    type="text"
                                    value={masterForm.beneficiaryName}
                                    onChange={(e) => setMasterForm({ ...masterForm, beneficiaryName: e.target.value })}
                                    placeholder="VD: OVIE SPA"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Điểm bán *</label>
                                <input
                                    type="text"
                                    value={masterForm.pointOfSale}
                                    onChange={(e) => setMasterForm({ ...masterForm, pointOfSale: e.target.value })}
                                    placeholder="VD: OVIE SPA"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Số tài khoản *</label>
                                    <input
                                        type="text"
                                        value={masterForm.accountNumber}
                                        onChange={(e) => setMasterForm({ ...masterForm, accountNumber: e.target.value })}
                                        placeholder="VD: A000000775"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mã ngân hàng</label>
                                    <input
                                        type="text"
                                        value={masterForm.bankCode}
                                        onChange={(e) => setMasterForm({ ...masterForm, bankCode: e.target.value })}
                                        placeholder="VD: 970415"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">MCC *</label>
                                    <input
                                        type="text"
                                        value={masterForm.mcc}
                                        onChange={(e) => setMasterForm({ ...masterForm, mcc: e.target.value })}
                                        placeholder="VD: 7298"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Thành phố</label>
                                    <input
                                        type="text"
                                        value={masterForm.merchantCity}
                                        onChange={(e) => setMasterForm({ ...masterForm, merchantCity: e.target.value })}
                                        placeholder="VD: LAMDONG"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mã bưu điện</label>
                                    <input
                                        type="text"
                                        value={masterForm.postalCode}
                                        onChange={(e) => setMasterForm({ ...masterForm, postalCode: e.target.value })}
                                        placeholder="VD: 670000"
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="masterActive"
                                    checked={masterForm.isActive}
                                    onChange={(e) => setMasterForm({ ...masterForm, isActive: e.target.checked })}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor="masterActive" className="text-sm text-slate-700">Đang hoạt động</label>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={closeMasterModal}
                                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSaveMaster}
                                disabled={!masterForm.mid || !masterForm.beneficiaryName || !masterForm.accountNumber || !masterForm.mcc}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="w-4 h-4" />
                                {editingMaster ? 'Cập nhật' : 'Thêm mới'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Modal */}
            {showProductModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-slate-800">
                                {editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
                            </h3>
                            <button onClick={closeProductModal} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Tên sản phẩm *</label>
                                <input
                                    type="text"
                                    value={productForm.productName}
                                    onChange={(e) => setProductForm({ ...productForm, productName: e.target.value })}
                                    placeholder="VD: COMBO"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Mã sản phẩm *</label>
                                <input
                                    type="text"
                                    value={productForm.productCode}
                                    onChange={(e) => setProductForm({ ...productForm, productCode: e.target.value })}
                                    placeholder="VD: OV1"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền mặc định</label>
                                <input
                                    type="number"
                                    value={productForm.defaultAmount}
                                    onChange={(e) => setProductForm({ ...productForm, defaultAmount: e.target.value })}
                                    placeholder="VD: 1000000"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="productActive"
                                    checked={productForm.isActive}
                                    onChange={(e) => setProductForm({ ...productForm, isActive: e.target.checked })}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <label htmlFor="productActive" className="text-sm text-slate-700">Đang hoạt động</label>
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                            <button
                                onClick={closeProductModal}
                                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                Hủy
                            </button>
                            <button
                                onClick={handleSaveProduct}
                                disabled={!productForm.productName || !productForm.productCode}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Save className="w-4 h-4" />
                                {editingProduct ? 'Cập nhật' : 'Thêm mới'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QRManagement;
