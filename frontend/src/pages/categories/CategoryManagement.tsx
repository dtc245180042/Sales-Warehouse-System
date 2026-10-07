import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderTree,
  Folder,
  FolderOpen,
  Plus,
  Edit2,
  Trash2,
  ArrowRightLeft,
  ChevronRight,
  ChevronDown,
  Package,
  Layers,
  Search,
  RefreshCw,
  CheckCircle2,
  X,
} from 'lucide-react';
import { categoryService } from '../../services/categoryService';
import { Category, CategoryTree, CategoryProduct } from '../../types/Category';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../../components/common/Button';

export const CategoryManagement: React.FC = () => {
  const { showToast } = useToast();
  const [categoriesTree, setCategoriesTree] = useState<CategoryTree[]>([]);
  const [flatCategories, setFlatCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<number>>(new Set());

  // Nhóm hàng đang được chọn để xem danh sách sản phẩm
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<CategoryProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState<boolean>(false);

  // State Modal Thêm / Sửa
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [parentCategoryForCreate, setParentCategoryForCreate] = useState<Category | null>(null);
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formParentId, setFormParentId] = useState<number | ''>('');
  const [isSubmittingForm, setIsSubmittingForm] = useState<boolean>(false);

  // State Modal Chuyển sản phẩm
  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [transferSourceCategory, setTransferSourceCategory] = useState<Category | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [transferTargetCategoryId, setTransferTargetCategoryId] = useState<number | ''>('');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState<boolean>(false);

  // State Modal Cảnh báo / Xác nhận Xóa
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load danh mục dạng cây và dạng phẳng
  const loadData = async (expandAll: boolean = false) => {
    setIsLoading(true);
    try {
      const [treeData, flatData] = await Promise.all([
        categoryService.getTree(),
        categoryService.getList(),
      ]);
      setCategoriesTree(treeData);
      setFlatCategories(flatData);

      // Tự động mở rộng các cấp 1 và 2 để hiển thị cấu trúc 3 cấp
      if (expandAll || expandedNodeIds.size === 0) {
        const initialExpanded = new Set<number>();
        const traverse = (nodes: CategoryTree[]) => {
          nodes.forEach((n) => {
            initialExpanded.add(n.id);
            if (n.children && n.children.length > 0) {
              traverse(n.children);
            }
          });
        };
        traverse(treeData);
        setExpandedNodeIds(initialExpanded);
      }

      // Cập nhật lại thông tin selectedCategory nếu đang chọn, nếu không thì duy trì ở Root
      if (selectedCategory) {
        const updatedSelected = flatData.find((c) => c.id === selectedCategory.id) || null;
        setSelectedCategory(updatedSelected);
        if (updatedSelected) {
          loadCategoryProducts(updatedSelected.id);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Không thể tải danh sách nhóm hàng', 'error', 'Lỗi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategoryProducts = async (categoryId: number) => {
    setIsLoadingProducts(true);
    try {
      const prods = await categoryService.getProducts(categoryId);
      setCategoryProducts(prods);
    } catch (err: any) {
      showToast(err.message || 'Lỗi tải sản phẩm trong nhóm', 'error');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAllNodes = () => {
    const allIds = new Set<number>();
    flatCategories.forEach((c) => allIds.add(c.id));
    setExpandedNodeIds(allIds);
  };

  const collapseAllNodes = () => {
    setExpandedNodeIds(new Set());
  };

  const handleSelectCategory = (cat: Category) => {
    setSelectedCategory(cat);
    loadCategoryProducts(cat.id);
    setSelectedProductIds([]);
  };

  // Chọn Thư mục gốc hệ thống (Root)
  const handleSelectRoot = () => {
    setSelectedCategory(null);
    setCategoryProducts([]);
    setSelectedProductIds([]);
  };

  // Danh sách các ngành hàng lớn Cấp 1 (trực thuộc Root)
  const level1Categories = useMemo(() => {
    return flatCategories.filter((c) => c.level === 1);
  }, [flatCategories]);

  // Breadcrumbs đường dẫn thư mục giống File Explorer trên PC
  const breadcrumbs = useMemo(() => {
    if (!selectedCategory) return [];
    const crumbs: Category[] = [selectedCategory];
    let curr = selectedCategory;
    while (curr.parent_id) {
      const parent = flatCategories.find((c) => c.id === curr.parent_id);
      if (parent) {
        crumbs.unshift(parent);
        curr = parent;
      } else {
        break;
      }
    }
    return crumbs;
  }, [selectedCategory, flatCategories]);

  // Các nhóm hàng con (sub-folders) trực thuộc nhóm đang mở
  const childCategories = useMemo(() => {
    if (!selectedCategory) return [];
    return flatCategories.filter((c) => c.parent_id === selectedCategory.id);
  }, [selectedCategory, flatCategories]);

  // Mở modal tạo mới: Nếu truyền parentCat thì tạo con của parentCat;
  // nếu parentCat === null thì tạo nhóm Cấp 1 (Root);
  // nếu không truyền thì mặc định tạo con của thư mục đang chọn selectedCategory (nếu ở Root thì tạo Cấp 1)
  const handleOpenCreateModal = (parentCat?: Category | null) => {
    setEditingCategory(null);
    let targetParent: Category | null = null;
    if (parentCat === null) {
      targetParent = null; // Tạo ngành hàng gốc Cấp 1 (Root)
    } else if (parentCat !== undefined) {
      targetParent = parentCat;
    } else {
      targetParent = selectedCategory; // Tạo con của thư mục đang mở
    }

    setParentCategoryForCreate(targetParent);
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormParentId(targetParent ? targetParent.id : '');
    setIsFormModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setParentCategoryForCreate(null);
    setFormCode(cat.code);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setFormParentId(cat.parent_id !== null && cat.parent_id !== undefined ? cat.parent_id : '');
    setIsFormModalOpen(true);
  };

  // Submit tạo / sửa nhóm hàng
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) {
      showToast('Vui lòng nhập đầy đủ mã và tên nhóm hàng', 'warning');
      return;
    }

    setIsSubmittingForm(true);
    try {
      const parentIdVal = formParentId === '' ? null : Number(formParentId);
      if (editingCategory) {
        await categoryService.update(editingCategory.id, {
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
          description: formDescription.trim(),
          parent_id: parentIdVal,
        });
        showToast(`Đã cập nhật nhóm hàng "${formName}" thành công!`, 'success');
      } else {
        await categoryService.create({
          code: formCode.trim().toUpperCase(),
          name: formName.trim(),
          description: formDescription.trim(),
          parent_id: parentIdVal,
        });
        showToast(`Đã thêm mới nhóm hàng "${formName}" thành công!`, 'success');
      }
      setIsFormModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Lỗi thao tác nhóm hàng', 'error', 'Thao tác thất bại');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  // Mở modal chuyển sản phẩm
  const handleOpenTransferModal = (cat: Category, singleProductId?: number) => {
    setTransferSourceCategory(cat);
    if (singleProductId) {
      setSelectedProductIds([singleProductId]);
    } else if (selectedProductIds.length === 0) {
      // Mặc định chọn tất cả sản phẩm trong nhóm
      setSelectedProductIds(categoryProducts.map((p) => p.id));
    }
    // Gợi ý nhóm đích khác nhóm nguồn
    const otherCat = flatCategories.find((c) => c.id !== cat.id);
    setTransferTargetCategoryId(otherCat ? otherCat.id : '');
    setIsTransferModalOpen(true);
  };

  // Submit chuyển sản phẩm
  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSourceCategory) return;
    if (selectedProductIds.length === 0) {
      showToast('Vui lòng chọn ít nhất một sản phẩm cần chuyển nhóm', 'warning');
      return;
    }
    if (!transferTargetCategoryId) {
      showToast('Vui lòng chọn nhóm hàng đích', 'warning');
      return;
    }
    if (transferTargetCategoryId === transferSourceCategory.id) {
      showToast('Nhóm đích phải khác nhóm nguồn hiện tại', 'warning');
      return;
    }

    setIsSubmittingTransfer(true);
    try {
      const res = await categoryService.transferProducts({
        source_category_id: transferSourceCategory.id,
        target_category_id: Number(transferTargetCategoryId),
        product_ids: selectedProductIds,
      });

      showToast(res.message, 'success', 'Chuyển nhóm sản phẩm thành công');
      setIsTransferModalOpen(false);
      setSelectedProductIds([]);
      await loadData();
      if (selectedCategory) {
        loadCategoryProducts(selectedCategory.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Không thể chuyển sản phẩm', 'error', 'Thất bại');
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // Xóa nhóm hàng có Guard bảo vệ
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    setIsDeleting(true);
    try {
      const res = await categoryService.delete(categoryToDelete.id);
      showToast(res.message, 'success', 'Xóa thành công');
      setCategoryToDelete(null);
      if (selectedCategory?.id === categoryToDelete.id) {
        setSelectedCategory(null);
        setCategoryProducts([]);
      }
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Không thể xóa nhóm hàng', 'error', 'Thao tác bị chặn');
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle chọn sản phẩm checkbox
  const handleToggleProductSelect = (id: number) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle chọn tất cả sản phẩm
  const handleToggleSelectAllProducts = () => {
    if (selectedProductIds.length === categoryProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(categoryProducts.map((p) => p.id));
    }
  };

  // Lọc cây theo từ khóa tìm kiếm
  const filterTree = (nodes: CategoryTree[], query: string): CategoryTree[] => {
    if (!query.trim()) return nodes;
    const lower = query.toLowerCase();

    return nodes
      .map((node) => {
        const matchesCurrent =
          node.name.toLowerCase().includes(lower) || node.code.toLowerCase().includes(lower);
        const filteredChildren = filterTree(node.children || [], query);
        if (matchesCurrent || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
        return null;
      })
      .filter(Boolean) as CategoryTree[];
  };

  const filteredTreeData = useMemo(() => {
    return filterTree(categoriesTree, searchKeyword);
  }, [categoriesTree, searchKeyword]);

  // Render từng Node trong Cây Danh Mục Nhiều Cấp
  const renderTreeNode = (node: CategoryTree, depth: number = 0) => {
    const isExpanded = expandedNodeIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedCategory?.id === node.id;
    const canDelete = node.product_count === 0 && node.children_count === 0;

    // Màu sắc theo cấp độ
    let badgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    let levelTitle = `Cấp ${node.level}`;
    if (node.level === 1) {
      badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300';
      levelTitle = 'Ngành hàng lớn (Cấp 1)';
    } else if (node.level === 2) {
      badgeClass = 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300';
      levelTitle = 'Nhóm hàng (Cấp 2)';
    } else if (node.level >= 3) {
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300';
      levelTitle = 'Tiểu nhóm (Cấp 3)';
    }

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => handleSelectCategory(node)}
          style={{ paddingLeft: `${depth * 1.5 + 0.75}rem` }}
          className={`group flex items-center justify-between py-2.5 pr-3 rounded-xl transition-all cursor-pointer border ${isSelected
            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm'
            : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50 border-transparent'
            }`}
        >
          {/* Cột Tên & Toggle Cây */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                )}
              </button>
            ) : (
              <span className="w-6 h-6 flex items-center justify-center text-slate-300 dark:text-slate-700">
                •
              </span>
            )}

            {isExpanded && hasChildren ? (
              <FolderOpen className="w-5 h-5 text-indigo-500 shrink-0" />
            ) : (
              <Folder className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 shrink-0" />
            )}

            <div className="truncate">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {node.name}
              </span>
              <span className="ml-2 text-xs font-mono text-slate-400 dark:text-slate-500">
                [{node.code}]
              </span>
            </div>
          </div>

          {/* Cột Badge Thông tin & Hành động */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Badge Cấp độ */}
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${badgeClass}`}
              title={levelTitle}
            >
              Cấp {node.level}
            </span>

            {/* Thống kê sản phẩm & nhóm con */}
            <span
              className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center gap-1.5"
              title={
                node.total_product_count !== undefined && node.total_product_count > node.product_count
                  ? `Trực tiếp: ${node.product_count} sp | Tổng cộng dồn toàn ngành: ${node.total_product_count} sp`
                  : `Số sản phẩm trực thuộc: ${node.product_count} sp`
              }
            >
              <Package className="w-3.5 h-3.5 text-slate-400" />
              {node.total_product_count !== undefined && node.total_product_count > node.product_count ? (
                <span>
                  <strong className="text-slate-800 dark:text-slate-200">{node.product_count}</strong>
                  <span className="ml-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                    (Toàn ngành: {node.total_product_count})
                  </span>
                </span>
              ) : (
                <span>{node.product_count}</span>
              )}
            </span>

            {/* Nút hành động nhanh */}
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCreateModal(node);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
                title="Thêm nhóm con trực thuộc"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenEditModal(node);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-700 transition-colors"
                title="Chỉnh sửa thông tin"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              {/* Nút Xóa có Guard Bảo vệ (SCRUM-214) */}
              <button
                type="button"
                disabled={!canDelete}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canDelete) {
                    setCategoryToDelete(node);
                  }
                }}
                className={`p-1.5 rounded-lg transition-colors ${canDelete
                  ? 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer'
                  : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                  }`}
                title={
                  canDelete
                    ? 'Xóa nhóm hàng rỗng'
                    : `Không thể xóa: Nhóm còn ${node.children_count} nhóm con và ${node.product_count} sản phẩm.`
                }
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Nhánh con lồng nhau */}
        {hasChildren && isExpanded && (
          <div className="relative pl-2 border-l border-slate-200 dark:border-slate-800 ml-4 my-1 space-y-1">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Tiêu đề trang */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <FolderTree className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Quản lý Nhóm Hàng Nhiều Cấp
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Phân cấp ngành hàng theo cấu trúc cây, quản lý sản phẩm và chuyển nhóm linh hoạt.
          </p>
        </div>

        {/* Nút tác vụ làm mới */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(false)}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {/* Khu vực nội dung chính: Cột trái (Cây Danh Mục) & Cột phải (Chi tiết & Sản phẩm) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CỘT TRÁI: CÂY DANH MỤC (5 CỘT) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col h-[650px]">
          {/* Thanh tìm kiếm & Nút mở rộng/thu gọn cây */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm mã hoặc tên nhóm hàng..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold">Cấu trúc cây ({flatCategories.length} nhóm)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={expandAllNodes}
                  className="hover:text-indigo-600 transition-colors"
                >
                  Mở rộng tất cả
                </button>
                <span>|</span>
                <button
                  type="button"
                  onClick={collapseAllNodes}
                  className="hover:text-indigo-600 transition-colors"
                >
                  Thu gọn
                </button>
              </div>
            </div>
          </div>

          {/* Vùng cuộn danh sách cây */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                Đang tải cấu trúc cây danh mục...
              </div>
            ) : filteredTreeData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <FolderTree className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
                <p className="text-xs">Chưa có nhóm hàng nào trong hệ thống.</p>
              </div>
            ) : (
              <>
                {/* Node Danh mục gốc ở đầu Cây */}
                <div className="select-none mb-1.5">
                  <div
                    onClick={handleSelectRoot}
                    className={`group flex items-center justify-between py-2 px-3 rounded-xl transition-all cursor-pointer border ${selectedCategory === null
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 shadow-sm'
                      : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50 border-transparent'
                      }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Layers
                        className={`w-4 h-4 shrink-0 ${selectedCategory === null
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-500 group-hover:text-indigo-500'
                          }`}
                      />
                      <span
                        className={`text-xs font-bold truncate ${selectedCategory === null
                          ? 'text-indigo-900 dark:text-indigo-100'
                          : 'text-slate-700 dark:text-slate-300'
                          }`}
                      >
                        Tất cả nhóm hàng
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        [{level1Categories.length} ngành]
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCreateModal(null);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors"
                      title="Thêm Ngành hàng Cấp 1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  {filteredTreeData.map((node) => renderTreeNode(node, 0))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* CỘT PHẢI: CHI TIẾT NHÓM HÀNG & DANH SÁCH SẢN PHẨM TRỰC THUỘC (7 CỘT) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col h-[650px]">
          {selectedCategory ? (
            <div className="flex flex-col h-full">
              {/* THANH ĐƯỜNG DẪN BREADCRUMB */}
              <div className="flex items-center gap-1.5 py-1.5 px-3 mb-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs overflow-x-auto">
                <button
                  type="button"
                  onClick={handleSelectRoot}
                  className="flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 font-semibold shrink-0"
                  title="Quay về tất cả nhóm hàng"
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Tất cả nhóm hàng</span>
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() => handleSelectCategory(crumb)}
                      className={`shrink-0 font-medium ${idx === breadcrumbs.length - 1
                        ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-indigo-600'
                        }`}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Tiêu đề nhóm đang chọn */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {selectedCategory.code}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedCategory.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      Cấp {selectedCategory.level}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedCategory.description || 'Chưa có mô tả cho nhóm hàng này.'}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenCreateModal(selectedCategory)}
                    leftIcon={<Plus className="w-3.5 h-3.5 text-emerald-600" />}
                    className="border-emerald-200 hover:bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                    title="Tạo nhóm hàng con trực thuộc nhóm này"
                  >
                    Tạo nhóm con
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenTransferModal(selectedCategory)}
                    leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
                    disabled={categoryProducts.length === 0}
                    title="Chuyển sản phẩm sang nhóm khác"
                  >
                    Chuyển {selectedProductIds.length > 0 ? `(${selectedProductIds.length}) SP` : 'sản phẩm'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditModal(selectedCategory)}
                    leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  >
                    Sửa
                  </Button>
                </div>
              </div>

              {/* KHU VỰC THƯ MỤC CON (SUB-FOLDERS) NẾU CÓ */}
              {childCategories.length > 0 && (
                <div className="py-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                      Nhóm con trực thuộc ({childCategories.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal(selectedCategory)}
                      className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Thêm nhóm con
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {childCategories.map((child) => (
                      <div
                        key={child.id}
                        onClick={() => handleSelectCategory(child)}
                        className="group p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer flex items-center gap-2"
                        title={`Bấm để mở nhóm ${child.name}`}
                      >
                        <Folder className="w-5 h-5 text-amber-500 shrink-0 group-hover:text-indigo-500 transition-colors" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600">
                            {child.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                            <span>[{child.code}]</span>
                            <span>• {child.product_count} SP</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCreateModal(child);
                          }}
                          className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 transition-all shrink-0"
                          title={`Tạo nhóm con trực thuộc ${child.name}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Thông tin tóm tắt & Bộ đếm Sản phẩm */}
              <div className="py-2.5 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  Sản phẩm trong nhóm ({categoryProducts.length} mặt hàng)
                </span>
                {categoryProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleSelectAllProducts}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                  >
                    {selectedProductIds.length === categoryProducts.length
                      ? 'Bỏ chọn tất cả'
                      : 'Chọn tất cả để chuyển'}
                  </button>
                )}
              </div>

              {/* Bảng danh sách sản phẩm trong nhóm */}
              <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                {isLoadingProducts ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                    Đang tải sản phẩm trong nhóm...
                  </div>
                ) : categoryProducts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
                    <p className="text-xs">Chưa có sản phẩm nào thuộc nhóm này.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Bạn có thể chuyển sản phẩm từ các nhóm khác sang đây hoặc thêm mới.
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              categoryProducts.length > 0 &&
                              selectedProductIds.length === categoryProducts.length
                            }
                            onChange={handleToggleSelectAllProducts}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </th>
                        <th className="py-2.5 px-3">Mã SKU</th>
                        <th className="py-2.5 px-3">Tên sản phẩm</th>
                        <th className="py-2.5 px-3 text-right">Đơn giá</th>
                        <th className="py-2.5 px-3 text-center">Hành động</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {categoryProducts.map((p) => {
                        const isChecked = selectedProductIds.includes(p.id);
                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${isChecked ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''
                              }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleProductSelect(p.id)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {p.sku}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                              {p.name}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700 dark:text-slate-300">
                              {p.price.toLocaleString('vi-VN')} đ
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenTransferModal(selectedCategory, p.id)}
                                className="px-2 py-1 rounded-md text-[11px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 font-medium inline-flex items-center gap-1 transition-colors"
                                title="Chuyển riêng sản phẩm này sang nhóm khác"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                Chuyển
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* GIAO DIỆN TẤT CẢ NHÓM HÀNG (DANH MỤC PHÂN CẤP TOÀN HỆ THỐNG)             */
            /* ========================================================================= */
            <div className="flex flex-col h-full">
              {/* THANH ĐƯỜNG DẪN BREADCRUMB */}
              <div className="flex items-center justify-between py-1.5 px-3 mb-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tất cả nhóm hàng</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  {level1Categories.length} ngành hàng Cấp 1 • {flatCategories.length} tổng số nhóm
                </span>
              </div>

              {/* TIÊU ĐỀ TẤT CẢ NHÓM HÀNG */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600">
                      <FolderTree className="w-5 h-5" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Danh mục tất cả nhóm hàng
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      Toàn hệ thống
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Cơ cấu phân cấp ngành hàng và danh sách sản phẩm. Nhấn vào ngành hàng để mở phân cấp con hoặc chuyển sản phẩm.
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleOpenCreateModal(null)}
                  leftIcon={<Plus className="w-4 h-4" />}
                  className="shadow-sm shadow-indigo-500/20 shrink-0"
                  title="Thêm ngành hàng cấp 1 mới"
                >
                  Thêm ngành hàng Cấp 1
                </Button>
              </div>

              {/* LƯỚI NGÀNH HÀNG CẤP 1 */}
              <div className="flex-1 overflow-y-auto pt-4 space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-amber-500" />
                    Danh sách Ngành Hàng Cấp 1 ({level1Categories.length})
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Bấm vào thẻ để duyệt các nhóm con
                  </span>
                </div>

                {level1Categories.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center p-6 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <Folder className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-2" />
                    <p className="text-xs font-semibold">Chưa có ngành hàng cấp 1 nào.</p>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateModal(null)}
                      className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                    >
                      + Bấm vào đây để tạo ngành hàng Cấp 1 đầu tiên
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {level1Categories.map((cat) => {
                      const directChildren = flatCategories.filter((c) => c.parent_id === cat.id);
                      const canDel = cat.product_count === 0 && directChildren.length === 0;

                      return (
                        <div
                          key={cat.id}
                          onClick={() => handleSelectCategory(cat)}
                          className="group p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer shadow-sm hover:shadow-md"
                          title={`Nhấn để mở ngành hàng ${cat.name}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 group-hover:text-indigo-600 transition-colors">
                                <Folder className="w-5 h-5" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600">
                                  {cat.name}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  [{cat.code}]
                                </div>
                              </div>
                            </div>

                            {/* Nút hành động nhanh trên card */}
                            <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCreateModal(cat);
                                }}
                                className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 transition-colors"
                                title="Thêm nhóm con Cấp 2 trực thuộc"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditModal(cat);
                                }}
                                className="p-1 rounded-md hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-amber-600 transition-colors"
                                title="Chỉnh sửa"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={!canDel}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canDel) setCategoryToDelete(cat);
                                }}
                                className={`p-1 rounded-md transition-colors ${canDel
                                  ? 'text-rose-500 hover:bg-white dark:hover:bg-slate-700'
                                  : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                                  }`}
                                title={canDel ? 'Xóa nhóm' : 'Không thể xóa khi còn nhóm con hoặc hàng'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <FolderOpen className="w-3 h-3 text-slate-400" />
                              {directChildren.length} nhóm con
                            </span>
                            <span className="flex items-center gap-1 font-medium">
                              <Package className="w-3 h-3 text-slate-400" />
                              {cat.product_count} sản phẩm
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL THÊM MỚI / CHỈNH SỬA NHÓM HÀNG                                      */}
      {/* ========================================================================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderTree className="w-5 h-5 text-indigo-600" />
                {editingCategory ? 'Chỉnh sửa nhóm hàng' : 'Thêm mới nhóm hàng'}
              </h3>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              {/* Vị trí phân cấp nhóm hàng */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 shrink-0">
                  {parentCategoryForCreate ? (
                    <Folder className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  )}
                </div>
                <div className="text-xs min-w-0 flex-1">
                  <div className="text-slate-500 dark:text-slate-400 text-[10px] uppercase tracking-wider font-semibold">
                    {editingCategory ? 'Thuộc phân cấp' : 'Trực thuộc nhóm hàng'}
                  </div>
                  <div className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-0.5 truncate">
                    {editingCategory ? (
                      editingCategory.parent_id ? (
                        `${flatCategories.find((c) => c.id === editingCategory.parent_id)?.name || 'Nhóm cha'} [Cấp ${editingCategory.level}]`
                      ) : (
                        'Ngành hàng chính (Cấp 1)'
                      )
                    ) : parentCategoryForCreate ? (
                      `${parentCategoryForCreate.name} [${parentCategoryForCreate.code}]`
                    ) : (
                      'Ngành hàng chính (Cấp 1)'
                    )}
                  </div>
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                    Phân cấp:{' '}
                    <strong>
                      {editingCategory
                        ? `Cấp ${editingCategory.level}`
                        : parentCategoryForCreate
                        ? `Cấp ${parentCategoryForCreate.level + 1} (Nhóm con)`
                        : 'Cấp 1 (Ngành hàng lớn)'}
                    </strong>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Mã nhóm hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: SMARTPHONE, DIEN_TU"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Tên nhóm hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Điện thoại thông minh"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Mô tả chi tiết
                </label>
                <textarea
                  rows={3}
                  placeholder="Mô tả ngành hàng, mục đích phân loại..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFormModalOpen(false)}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmittingForm}
                >
                  {editingCategory ? 'Lưu thay đổi' : 'Tạo nhóm hàng'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL CHUYỂN SẢN PHẨM GIỮA CÁC NHÓM HÀNG (SCRUM-214)                       */}
      {/* ========================================================================= */}
      {isTransferModalOpen && transferSourceCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                Chuyển sản phẩm sang nhóm khác
              </h3>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransfer} className="p-6 space-y-4">
              <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200">
                <span className="font-semibold block mb-0.5">Nhóm nguồn hiện tại:</span>
                <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">
                  {transferSourceCategory.name}
                </span>{' '}
                <span className="font-mono text-slate-500">[{transferSourceCategory.code}]</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Số lượng sản phẩm sẽ chuyển:
                </label>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Đang chọn{' '}
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                    {selectedProductIds.length}
                  </span>{' '}
                  sản phẩm
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Chọn nhóm hàng đích đến <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={transferTargetCategoryId}
                  onChange={(e) =>
                    setTransferTargetCategoryId(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  className="w-full px-3 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- Chọn nhóm hàng đích đến --</option>
                  {flatCategories
                    .filter((c) => c.id !== transferSourceCategory.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {'— '.repeat(c.level - 1)} {c.name} [Cấp {c.level}]
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsTransferModalOpen(false)}
                >
                  Hủy bỏ
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmittingTransfer}
                  leftIcon={<ArrowRightLeft className="w-4 h-4" />}
                >
                  Xác nhận chuyển nhóm
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL XÁC NHẬN XÓA (KÈM GUARD CHỐNG XÓA THEO SCRUM-214)                   */}
      {/* ========================================================================= */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Xác nhận xóa nhóm hàng
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Bạn có chắc chắn muốn xóa nhóm hàng{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  "{categoryToDelete.name}"
                </strong>{' '}
                ({categoryToDelete.code}) không?
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Nhóm hàng này hoàn toàn rỗng (0 sản phẩm và 0 nhóm con), đủ điều kiện an toàn để xóa.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCategoryToDelete(null)}
              >
                Hủy
              </Button>
              <Button
                variant="danger"
                size="sm"
                isLoading={isDeleting}
                onClick={handleConfirmDelete}
              >
                Xác nhận xóa
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
