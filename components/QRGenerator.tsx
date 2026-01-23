import React, { useState, useEffect, useMemo } from 'react';
import { QrCode, Calendar, DollarSign, ChevronDown, Download, Copy, Check, RefreshCw } from 'lucide-react';
import { QRMasterData, QRProduct } from '../types';
import { QRMasterService, QRProductService, generateEMVQRString } from '../src/lib/qrServices';

const QRGenerator: React.FC = () => {
    // Data states
    const [masters, setMasters] = useState<QRMasterData[]>([]);
    const [products, setProducts] = useState<QRProduct[]>([]);
    const [loading, setLoading] = useState(true);

    // Form states
    const [selectedMasterId, setSelectedMasterId] = useState('');
    const [selectedProductId, setSelectedProductId] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentDeadline, setPaymentDeadline] = useState('');

    // Generated QR
    const [qrString, setQrString] = useState('');
    const [copied, setCopied] = useState(false);

    // Load data on mount
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [mastersData, productsData] = await Promise.all([
                QRMasterService.listMasters(true), // Only active
                QRProductService.listProducts(undefined, true), // Only active
            ]);
            setMasters(mastersData);
            setProducts(productsData);
        } catch (error) {
            console.error('Error loading QR data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Get selected master data
    const selectedMaster = useMemo(() => {
        return masters.find(m => m.id === selectedMasterId) || null;
    }, [masters, selectedMasterId]);

    // Get products for selected master
    const availableProducts = useMemo(() => {
        return products.filter(p => p.masterId === selectedMasterId);
    }, [products, selectedMasterId]);

    // Get selected product data
    const selectedProduct = useMemo(() => {
        return products.find(p => p.id === selectedProductId) || null;
    }, [products, selectedProductId]);

    // Reset product when master changes
    useEffect(() => {
        setSelectedProductId('');
        setAmount('');
        setQrString('');
    }, [selectedMasterId]);

    // Set default amount when product changes
    useEffect(() => {
        if (selectedProduct?.defaultAmount) {
            setAmount(selectedProduct.defaultAmount.toString());
        }
    }, [selectedProduct]);

    // Set default deadline to now + 1 day
    useEffect(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPaymentDeadline(tomorrow.toISOString().slice(0, 16));
    }, []);

    // Generate QR
    const handleGenerateQR = () => {
        if (!selectedMaster || !selectedProduct) {
            alert('Vui lòng chọn đầy đủ thông tin');
            return;
        }

        const parsedAmount = parseFloat(amount) || 0;
        const qr = generateEMVQRString(selectedMaster, selectedProduct, parsedAmount);
        setQrString(qr);
        setCopied(false);
    };

    // Copy QR string
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(qrString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };

    // Generate QR image URL using api.qrserver.com (same as Google Sheets)
    const qrImageUrl = useMemo(() => {
        if (!qrString) return '';
        return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrString)}`;
    }, [qrString]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-slate-500">Đang tải dữ liệu...</div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
                    <QrCode className="w-8 h-8 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">Tạo mã QR thanh toán</h1>
                <p className="text-slate-500 mt-1">Chọn thông tin và tạo mã QR để thanh toán</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Form */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
                    {/* MID Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            MID (Chọn hộ) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <select
                                value={selectedMasterId}
                                onChange={(e) => setSelectedMasterId(e.target.value)}
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg appearance-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                            >
                                <option value="">-- Chọn MID --</option>
                                {masters.map(master => (
                                    <option key={master.id} value={master.id}>
                                        {master.midLabel}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Auto-filled fields */}
                    {selectedMaster && (
                        <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <span className="text-slate-500">Đơn vị thụ hưởng:</span>
                                    <div className="font-medium text-slate-800">{selectedMaster.beneficiaryName}</div>
                                </div>
                                <div>
                                    <span className="text-slate-500">Điểm bán:</span>
                                    <div className="font-medium text-slate-800">{selectedMaster.pointOfSale}</div>
                                </div>
                                <div>
                                    <span className="text-slate-500">MCC:</span>
                                    <div className="font-medium text-slate-800">{selectedMaster.mcc}</div>
                                </div>
                                <div>
                                    <span className="text-slate-500">Số TK:</span>
                                    <div className="font-medium text-slate-800 font-mono">{selectedMaster.accountNumber}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Product Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Sản phẩm <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <select
                                value={selectedProductId}
                                onChange={(e) => setSelectedProductId(e.target.value)}
                                disabled={!selectedMasterId}
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg appearance-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
                            >
                                <option value="">-- Chọn sản phẩm --</option>
                                {availableProducts.map(product => (
                                    <option key={product.id} value={product.id}>
                                        {product.productName} ({product.productCode})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                        </div>
                        {selectedMasterId && availableProducts.length === 0 && (
                            <p className="text-sm text-amber-600 mt-1">
                                MID này chưa có sản phẩm nào. Liên hệ admin để thêm.
                            </p>
                        )}
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Số tiền (VNĐ) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="Nhập số tiền"
                                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        {amount && (
                            <p className="text-sm text-slate-500 mt-1">
                                {parseFloat(amount).toLocaleString('vi-VN')} VNĐ
                            </p>
                        )}
                    </div>

                    {/* Payment Deadline */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Thời hạn thanh toán
                        </label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="datetime-local"
                                value={paymentDeadline}
                                onChange={(e) => setPaymentDeadline(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerateQR}
                        disabled={!selectedMasterId || !selectedProductId || !amount}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                        <QrCode className="w-5 h-5" />
                        Tạo mã QR
                    </button>
                </div>

                {/* QR Display */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-800 mb-4 text-center">Mã QR</h3>

                    {qrString ? (
                        <div className="space-y-4">
                            {/* QR Image */}
                            <div className="flex justify-center">
                                <div className="bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm">
                                    <img
                                        src={qrImageUrl}
                                        alt="QR Code"
                                        className="w-64 h-64"
                                    />
                                </div>
                            </div>

                            {/* Info */}
                            {selectedMaster && selectedProduct && (
                                <div className="bg-slate-50 rounded-lg p-4 text-center space-y-1">
                                    <div className="font-semibold text-slate-800">{selectedMaster.beneficiaryName}</div>
                                    <div className="text-slate-600">{selectedProduct.productName}</div>
                                    <div className="text-xl font-bold text-indigo-600">
                                        {parseFloat(amount).toLocaleString('vi-VN')} VNĐ
                                    </div>
                                </div>
                            )}

                            {/* QR String (collapsible) */}
                            <details className="bg-slate-50 rounded-lg">
                                <summary className="px-4 py-2 cursor-pointer text-sm text-slate-600 hover:text-slate-800">
                                    Xem chuỗi QR
                                </summary>
                                <div className="px-4 pb-3">
                                    <code className="block text-xs break-all bg-white p-2 rounded border border-slate-200 text-slate-600">
                                        {qrString}
                                    </code>
                                </div>
                            </details>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={handleCopy}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 text-emerald-600" />
                                            <span className="text-emerald-600">Đã copy!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            Copy chuỗi
                                        </>
                                    )}
                                </button>
                                <a
                                    href={qrImageUrl}
                                    download={`qr-${selectedProduct?.productCode || 'code'}.png`}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    Tải ảnh
                                </a>
                            </div>

                            {/* Reset */}
                            <button
                                onClick={() => {
                                    setQrString('');
                                    setSelectedMasterId('');
                                    setAmount('');
                                }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Tạo mã mới
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-80 text-slate-400">
                            <QrCode className="w-16 h-16 mb-4 opacity-50" />
                            <p>Chọn thông tin và bấm "Tạo mã QR"</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QRGenerator;
