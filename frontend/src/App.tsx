// Reactのフックと基本的な型定義をインポート
import React, { useState, useEffect, useMemo, useCallback } from 'react';
// アプリケーション全体のCSSをインポート
// エラーの原因となっていた、存在しないCSSファイルのインポートを削除しました。
// import './App.css';
// Material-UI (MUI) の主要コンポーネントをインポート
import { 
  Container, Grid, Card, CardMedia, Typography, TextField, Button, Box, Rating, CircularProgress, Alert,
  Dialog, DialogContent, IconButton, Snackbar, Pagination, FormControl, InputLabel, Select, MenuItem,
  type SelectChangeEvent, DialogTitle, FormControlLabel, Radio, RadioGroup, Checkbox, FormGroup,
  Popover, List, ListItem, ListItemText, ListItemIcon, DialogActions
} from '@mui/material';
// Material-UIのアイコンをインポート
import StarBorderIcon from '@mui/icons-material/StarBorder'; // 評価の星アイコン
import SyncIcon from '@mui/icons-material/Sync'; // 同期アイコン
import CloseIcon from '@mui/icons-material/Close'; // 閉じるアイコン
import ContentCopyIcon from '@mui/icons-material/ContentCopy'; // コピーアイコン
import DeleteIcon from '@mui/icons-material/Delete'; // 削除アイコン
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'; // 左矢印アイコン（前の画像へ）
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'; // 右矢印アイコン（次の画像へ）
import AddIcon from '@mui/icons-material/Add'; // 追加アイコン
import MenuIcon from '@mui/icons-material/Menu'; // メニューアイコン

// APIのベースURLを定数として定義
const API_URL = "http://localhost:8000/api";

// --- 型定義 ---

// 画像メタデータのインターフェース定義
// データベースから取得する画像の情報に対応
interface ImageMetaData {
  id: number; // 画像の一意なID
  filename: string; // ファイル名
  image_path: string; // 画像ファイルの相対パス
  parameters: string; // 画像生成時の全パラメータ（改行あり、表示用）
  search_text: string; // 検索用のパラメータ（改行なし）
  rating: number; // ユーザーによる評価（0-5）
}

// 画像リストAPIレスポンスのインターフェース定義
interface ImagesResponse {
    images: ImageMetaData[]; // 取得した画像データの配列
    total_search_results_count: number; // 検索条件に一致した画像の総件数
    total_database_count: number;      // データベースに登録されている全画像の総件数
}

// プロンプト生成要素のグループとアイテムの型
interface PromptElement {
  id: number;
  group_name: string;
  item_name: string;
  value: string; // 新しいプロンプト値（英単語）
  type: 'radio' | 'checkbox';
}

// --- 新しいコンポーネント: PromptGenerator ---
// プロンプト生成ツールを独立したコンポーネントとして切り出し、再描画を局所化します。
interface PromptGeneratorProps {
  open: boolean; // ダイアログの開閉状態
  onClose: () => void; // ダイアログを閉じるハンドラ
  onGenerateAndCopy: (prompt: string) => void; // プロンプトを生成・コピーするハンドラ
  onPromptFetchError: (message: string) => void; // エラーハンドラ
}

const PromptGenerator: React.FC<PromptGeneratorProps> = ({ open, onClose, onGenerateAndCopy, onPromptFetchError }) => {
  // プロンプト生成用の要素の状態
  const [promptElements, setPromptElements] = useState<PromptElement[]>([]);
  // 選択されたプロンプトアイテムの状態
  const [selectedPromptItems, setSelectedPromptItems] = useState<{[key: string]: string[]}>({});
  // 生成されたプロンプト文字列の状態
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  
  // プロンプト生成用の要素をAPIからフェッチする関数
  const fetchPromptElements = useCallback(async () => {
    try {
      const url = `${API_URL}/prompt_elements`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch prompt elements');
      }
      const data: PromptElement[] = await response.json();
      setPromptElements(data);
    } catch (err: any) {
      console.error("Failed to fetch prompt elements:", err);
      onPromptFetchError("プロンプト要素の取得に失敗しました。");
    }
  }, [onPromptFetchError]);

  // コンポーネントがマウントされた時、またはダイアログが開いたときに要素をフェッチ
  useEffect(() => {
    if (open && promptElements.length === 0) {
      fetchPromptElements();
    }
  }, [open, promptElements.length, fetchPromptElements]);
  
  // 選択されたプロンプト要素が変更されたらプロンプトを再生成
  useEffect(() => {
    const promptParts: string[] = [];
    Object.keys(selectedPromptItems).forEach(groupName => {
      promptParts.push(...selectedPromptItems[groupName]);
    });
    setGeneratedPrompt(promptParts.join(', '));
  }, [selectedPromptItems]);

  // プロンプト生成ウィンドウのラジオボタン/チェックボックス変更ハンドラ
  const handlePromptItemChange = (groupName: string, itemValue: string, type: 'radio' | 'checkbox') => {
    setSelectedPromptItems(prevItems => {
      const newItems = { ...prevItems };
      if (type === 'radio') {
        // ラジオボタンの場合、同じグループ内の他の選択を解除
        newItems[groupName] = [itemValue];
      } else {
        // チェックボックスの場合、選択/解除をトグル
        const currentItems = newItems[groupName] || [];
        const itemIndex = currentItems.indexOf(itemValue);
        if (itemIndex > -1) {
          // 既に存在する場合は削除
          newItems[groupName] = currentItems.filter(item => item !== itemValue);
        } else {
          // 存在しない場合は追加
          newItems[groupName] = [...currentItems, itemValue];
        }
      }
      return newItems;
    });
  };

  // プロンプト要素をグループごとに分類（パフォーマンス向上のためuseMemoを使用）
  const groupedPromptElements = useMemo(() => {
    return promptElements.reduce<{[key: string]: PromptElement[]}>((acc, element) => {
      if (!acc[element.group_name]) {
        acc[element.group_name] = [];
      }
      acc[element.group_name].push(element);
      return acc;
    }, {});
  }, [promptElements]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        プロンプト生成
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" sx={{ mr: 1 }}>生成されたプロンプト</Typography>
            <IconButton size="small" onClick={() => onGenerateAndCopy(generatedPrompt)}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Box>
          <TextField
            fullWidth
            multiline
            rows={2}
            value={generatedPrompt}
            InputProps={{
              readOnly: true,
            }}
          />
        </Box>
        <Grid container spacing={2}>
          {Object.entries(groupedPromptElements).map(([groupName, elements]) => (
            <Grid item xs={12} sm={6} key={groupName}>
              <Typography variant="h6" sx={{ mb: 1 }}>{groupName}</Typography>
              {elements[0].type === 'radio' ? (
                <RadioGroup
                  value={selectedPromptItems[groupName]?.[0] || ''}
                  onChange={(e) => handlePromptItemChange(groupName, e.target.value, 'radio')}
                  sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}
                >
                  {elements.map(element => (
                    <FormControlLabel
                      key={element.id}
                      value={element.value}
                      control={<Radio />}
                      label={element.item_name}
                    />
                  ))}
                </RadioGroup>
              ) : (
                <FormGroup sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
                  {elements.map(element => (
                    <FormControlLabel
                      key={element.id}
                      control={
                        <Checkbox
                          checked={selectedPromptItems[groupName]?.includes(element.value) || false}
                          onChange={() => handlePromptItemChange(groupName, element.value, 'checkbox')}
                        />
                      }
                      label={element.item_name}
                    />
                  ))}
                </FormGroup>
              )}
            </Grid>
          ))}
        </Grid>
      </DialogContent>
    </Dialog>
  );
};

// --- メインアプリケーションコンポーネント ---
function App() {
  // --- 状態変数（useState）の定義 ---
  const [images, setImages] = useState<ImageMetaData[]>([]); // 表示する画像データの配列
  const [searchQuery, setSearchQuery] = useState(''); // 検索バーの入力値
  const [loading, setLoading] = useState(false); // APIリクエスト中のロード状態
  const [error, setError] = useState<string | null>(null); // エラーメッセージ
  const [openModal, setOpenModal] = useState(false); // 画像詳細モーダルの開閉状態
  const [selectedImage, setSelectedImage] = useState<ImageMetaData | null>(null); // 詳細表示する画像データ
  const [snackbarOpen, setSnackbarOpen] = useState(false); // スナックバー（一時的なメッセージ表示）の開閉状態
  const [snackbarMessage, setSnackbarMessage] = useState(''); // スナックバーに表示するメッセージ
  const [currentPage, setCurrentPage] = useState(1); // 現在のページ番号
  
  // 検索結果の総件数とデータベース全体の総件数（初期値はnullで未ロード状態を示す）
  const [totalSearchResults, setTotalSearchResults] = useState<number | null>(null);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState<number | null>(null);
  
  const [imagesPerPage, setImagesPerPage] = useState<number>(25); // 1ページあたりの表示画像数

  // ソート機能の状態変数
  const [sortBy, setSortBy] = useState<string>('created_at'); // ソート基準 ('created_at'または'rating')
  const [sortOrder, setSortOrder] = useState<string>('desc'); // ソート順序 ('asc'または'desc')

  // 削除確認ダイアログの状態
  const [openConfirmDeleteDialog, setOpenConfirmDeleteDialog] = useState(false);

  // プロンプト生成ウィンドウの状態
  const [openPromptDialog, setOpenPromptDialog] = useState(false);
  
  // --- API呼び出し関数 ---

  // 画像リストをAPIからフェッチする非同期関数
  const fetchImages = useCallback(async (query = '', page = 1, limit = imagesPerPage) => {
    setLoading(true); // ロード開始
    setError(null); // エラーをリセット
    try {
      const params = new URLSearchParams(); // URLクエリパラメータを構築
      if (query) {
        params.append('query', query); // 検索クエリがあれば追加
      }
      params.append('page', String(page)); // ページ番号を追加
      params.append('limit', String(limit)); // 1ページあたりの画像数を追加
      params.append('sort_by', sortBy); // ソート基準を追加
      params.append('sort_order', sortOrder); // ソート順序を追加
      
      const url = `${API_URL}/images?${params.toString()}`; // 完全なAPI URLを構築
      const response = await fetch(url); // APIリクエストを実行

      if (!response.ok) { // レスポンスが正常でなければエラーをスロー
        throw new Error('Network response was not ok');
      }

      const data: ImagesResponse = await response.json(); // JSONレスポンスをパース
      
      setImages(data.images); // 取得した画像データをステートにセット
      setTotalSearchResults(data.total_search_results_count); // 検索結果の総件数をセット
      setTotalDatabaseCount(data.total_database_count); // DB全体の総件数をセット
      setCurrentPage(page); // 現在のページをセット

    } catch (err: any) { // エラーハンドリング
      setError(err.message);
    } finally {
      setLoading(false); // ロード終了
    }
  }, [imagesPerPage, sortBy, sortOrder]);

  // 特定の画像の詳細データをAPIからフェッチする非同期関数
  const fetchImageDetail = useCallback(async (imageId: number) => {
    try {
      const url = `${API_URL}/images/${imageId}`; // 特定の画像詳細API URL
      const response = await fetch(url); // APIリクエストを実行
      if (!response.ok) {
        throw new Error('Failed to fetch image detail');
      }
      const data: ImageMetaData = await response.json(); // JSONレスポンスをパース
      return data;
    } catch (err: any) {
      console.error("Failed to fetch image detail:", err);
      setError("Failed to load image details.");
      return null;
    }
  }, []);

  // --- 副作用フック (useEffect) ---

  // コンポーネントマウント時および、imagesPerPage, sortBy, sortOrderが変更された時に画像をフェッチ
  useEffect(() => {
    fetchImages(searchQuery, 1, imagesPerPage); // 常に1ページ目からフェッチ
  }, [imagesPerPage, sortBy, sortOrder, fetchImages, searchQuery]); // 依存配列: これらの値が変わると再実行

  // --- イベントハンドラ ---

  // 検索ボタンクリック時のハンドラ
  const handleSearch = () => {
    fetchImages(searchQuery, 1, imagesPerPage); // 検索クエリで画像をフェッチ（1ページ目から）
  };

  // 画像の評価（レーティング）変更時のハンドラ
  const handleRatingChange = async (imageId: number, newRating: number | null) => {
    if (newRating === null) return; // レーティングがnullなら何もしない
    
    try {
      const response = await fetch(`${API_URL}/images/${imageId}/rate`, { // APIで評価を更新
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      });
      if (!response.ok) {
        throw new Error('Rating update failed');
      }
      // 成功したら表示中の画像リストの評価を更新
      setImages(prevImages =>
        prevImages.map(img =>
          (img.id === imageId ? { ...img, rating: newRating } : img)
        )
      );
    } catch (err: any) {
      console.error('Failed to update rating:', err);
      setError('Failed to update rating. Please try again.');
    }
  };

  // 同期ボタンクリック時のハンドラ
  const handleSync = async () => {
    setLoading(true); // ロード開始
    setError(null); // エラーをリセット
    try {
      const response = await fetch(`${API_URL}/images/sync`, { method: 'POST' }); // APIで画像を同期
      if (!response.ok) {
        throw new Error('Failed to sync images');
      }
      const data = await response.json(); // レスポンスデータを取得
      await fetchImages(searchQuery, 1, imagesPerPage); // 同期後、画像リストを再フェッチ（1ページ目から）
      setSnackbarMessage(data.message); // スナックバーメッセージをセット
      setSnackbarOpen(true); // スナックバーを表示
    } catch (err: any) {
      console.error('Failed to sync images:', err);
      setError('Failed to sync images. Check server logs for details.');
    } finally {
      setLoading(false); // ロード終了
    }
  };

  // 画像クリック時、詳細モーダルを開くハンドラ
  const handleOpenModal = async (image: ImageMetaData) => {
    const detail = await fetchImageDetail(image.id); // 詳細データをフェッチ
    if (detail) {
      setSelectedImage(detail); // 選択画像をセット
      setOpenModal(true); // モーダルを開く
    }
  };

  // 詳細モーダルを閉じるハンドラ
  const handleCloseModal = () => {
    setOpenModal(false); // モーダルを閉じる
    setSelectedImage(null); // 選択画像をリセット
    setOpenConfirmDeleteDialog(false); // 削除確認ダイアログも閉じる
  };

  // メタデータコピーボタンクリック時のハンドラ
  const handleCopyMetaData = (metaData: string) => {
    navigator.clipboard.writeText(metaData) // クリップボードにコピー
      .then(() => {
        setSnackbarMessage('メタデータをコピーしました！');
        setSnackbarOpen(true);
      })
      .catch((err) => {
        console.error('Failed to copy meta data:', err);
        setSnackbarMessage('コピーに失敗しました。');
        setSnackbarOpen(true);
      });
  };

  // スナックバーを閉じるハンドラ
  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') { // クリックアウェイの場合は閉じない
      return;
    }
    setSnackbarOpen(false); // スナックバーを閉じる
  };

  // ページネーションのページ変更時のハンドラ
  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    fetchImages(searchQuery, value, imagesPerPage); // 選択されたページで画像をフェッチ
  };

  // 1ページあたりの画像数変更時のハンドラ
  const handleImagesPerPageChange = (event: SelectChangeEvent<number>) => {
    const newLimit = event.target.value as number;
    setImagesPerPage(newLimit); // 新しい表示件数をセット
    fetchImages(searchQuery, 1, newLimit); // 1ページ目から画像を再フェッチ
  };

  // ソート基準変更時のハンドラ
  const handleSortByChange = (event: SelectChangeEvent<string>) => {
    setSortBy(event.target.value as string); // ソート基準を更新
    setCurrentPage(1); // 1ページ目に戻る
  };

  // ソート順序変更時のハンドラ
  const handleSortOrderChange = (event: SelectChangeEvent<string>) => {
    setSortOrder(event.target.value as string); // ソート順序を更新
    setCurrentPage(1); // 1ページ目に戻る
  };

  // 削除アイコンクリック時のハンドラ（確認ダイアログを開く）
  const handleDeleteIconClick = () => {
    setOpenConfirmDeleteDialog(true);
  };

  // 削除確認ダイアログで「削除」ボタン押下時のハンドラ
  const handleConfirmDelete = async () => {
    if (selectedImage) {
      setLoading(true); // ロード開始
      setError(null); // エラーをリセット
      try {
        const response = await fetch(`${API_URL}/images/${selectedImage.id}`, { // APIで画像を削除
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error('ファイルの削除に失敗しました。');
        }
        setSnackbarMessage('画像とデータベースエントリを削除しました。'); // 成功メッセージ
        setSnackbarOpen(true);
        handleCloseModal(); // 詳細モーダルを閉じる
        await fetchImages(searchQuery, currentPage, imagesPerPage); // 画像リストを再取得して更新
      } catch (err: any) {
        console.error('画像の削除に失敗:', err);
        setError(`削除エラー: ${err.message}`);
        setSnackbarMessage('削除に失敗しました。');
        setSnackbarOpen(true);
      } finally {
        setLoading(false); // ロード終了
        setOpenConfirmDeleteDialog(false); // 確認ダイアログを閉じる
      }
    }
  };

  // 削除確認ダイアログで「キャンセル」ボタン押下時のハンドラ
  const handleCancelDelete = () => {
    setOpenConfirmDeleteDialog(false); // 確認ダイアログを閉じる
  };

  // 前後の画像にナビゲートする関数
  const handleNavigateImage = async (direction: 'prev' | 'next') => {
    if (!selectedImage) return;

    // 現在のページ内での画像のインデックスを取得
    const currentIndex = images.findIndex(img => img.id === selectedImage.id);

    // インデックスが見つからない場合は処理を中断
    if (currentIndex === -1) {
      console.error("Selected image not found in the current images array.");
      return;
    }

    const nextIndex = currentIndex + (direction === 'next' ? 1 : -1);

    // 現在のページ内で前後の画像があれば、その詳細を表示
    if (nextIndex >= 0 && nextIndex < images.length) {
      const nextImage = images[nextIndex];
      const detail = await fetchImageDetail(nextImage.id);
      if (detail) {
        setSelectedImage(detail);
      }
    } else {
      // 現在のページの前/次の画像がない場合、ページを移動して画像をフェッチする
      let newPage = currentPage;
      const totalPages = Math.ceil((totalSearchResults || 0) / imagesPerPage);
      if (direction === 'prev' && currentPage > 1) {
        newPage = currentPage - 1;
      } else if (direction === 'next' && currentPage < totalPages) {
        newPage = currentPage + 1;
      }

      if (newPage !== currentPage) {
        setLoading(true);
        try {
          const params = new URLSearchParams();
          if (searchQuery) {
            params.append('query', searchQuery);
          }
          params.append('page', String(newPage));
          params.append('limit', String(imagesPerPage));
          params.append('sort_by', sortBy);
          params.append('sort_order', sortOrder);

          const url = `${API_URL}/images?${params.toString()}`;
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error('Failed to fetch new page of images.');
          }

          const data: ImagesResponse = await response.json();
          // 新しいページ全体の画像リストをステートにセット
          setImages(data.images);
          setCurrentPage(newPage);

          // 新しいページで表示すべき画像を選択
          let targetImage: ImageMetaData;
          if (direction === 'prev') {
            // 前のページに移動した場合、そのページの最後の画像を選択
            targetImage = data.images[data.images.length - 1];
          } else {
            // 次のページに移動した場合、そのページの最初の画像を選択
            targetImage = data.images[0];
          }
          
          // 選択した画像の詳細情報を取得し、モーダルを更新
          const detail = await fetchImageDetail(targetImage.id);
          if (detail) {
            setSelectedImage(detail);
          }
        } catch (err: any) {
          console.error('Failed to navigate to next/previous page:', err);
          setError('Failed to load images from the new page.');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  // プロンプト生成ウィンドウを開く
  const handleOpenPromptDialog = () => {
    setOpenPromptDialog(true);
  };
  
  // プロンプト生成ウィンドウを閉じる
  const handleClosePromptDialog = () => {
    setOpenPromptDialog(false);
  };

  // プロンプト生成ツールから受け取ったプロンプトを検索バーにセットしてコピーするハンドラ
  const handleGenerateAndCopyPrompt = (prompt: string) => {
    // 生成されたプロンプトを検索バーに自動反映
    setSearchQuery(prompt);
    // クリップボードにコピー
    navigator.clipboard.writeText(prompt)
      .then(() => {
        setSnackbarMessage('プロンプトをコピーしました！');
        setSnackbarOpen(true);
        handleClosePromptDialog(); // ダイアログを閉じる
      })
      .catch(err => {
        console.error('Failed to copy prompt:', err);
        setSnackbarMessage('プロンプトのコピーに失敗しました。');
        setSnackbarOpen(true);
      });
  };
  
  const totalPages = Math.ceil((totalSearchResults || 0) / imagesPerPage); 

  // 画像の詳細モーダル内でメタデータをレンダリングする関数
  const renderMetaData = (image: ImageMetaData | null) => {
    if (!image) return null;

    const metaDataText = image.parameters || '';

    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">生成パラメータ</Typography>
          <IconButton size="small" onClick={() => handleCopyMetaData(metaDataText)}>
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {metaDataText}
        </Typography>
      </Box>
    );
  };

  // --- メインレンダリング部分 ---
  return (
    <Container maxWidth={false} sx={{ pt: 2, pb: 2, maxWidth: '100%' }}>
      {/* 検索バー、同期ボタン、件数・ソート選択を含むスティッキーヘッダー */}
      <Box 
        sx={{
          p: 1,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
        }}
      >
        <Box 
          sx={{
            display: 'flex',
            mb: 1,
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          {/* プロンプト生成ボタン（メニュー） */}
          <Button
            variant="contained"
            onClick={handleOpenPromptDialog}
            startIcon={<AddIcon />}
            sx={{ height: '40px', minWidth: '90px' }}
          >
            プロンプト生成
          </Button>

          {/* 検索入力フィールド */}
          <TextField
            label="Search images..."
            variant="outlined"
            fullWidth
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {/* 検索ボタン */}
          <Button
            variant="contained"
            onClick={handleSearch}
            sx={{ height: '40px' }}
          >
            検索
          </Button>
          {/* 同期ボタン */}
          <Button
            variant="contained"
            onClick={handleSync}
            disabled={loading}
            startIcon={<SyncIcon />}
            sx={{ height: '40px', minWidth: '90px' }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '同期'}
          </Button>
          {/* 1ページあたりの表示件数選択 */}
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="images-per-page-label" size="small">件数</InputLabel>
            <Select
              labelId="images-per-page-label"
              id="images-per-page-select"
              value={imagesPerPage}
              label="件数"
              onChange={handleImagesPerPageChange}
              size="small"
            >
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
              <MenuItem value={200}>200</MenuItem>
            </Select>
          </FormControl>

          {/* ソート基準のセレクトボックス */}
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="sort-by-label" size="small">ソート基準</InputLabel>
            <Select
              labelId="sort-by-label"
              id="sort-by-select"
              value={sortBy}
              label="ソート基準"
              onChange={handleSortByChange}
              size="small"
            >
              <MenuItem value="created_at">作成日付</MenuItem>
              <MenuItem value="rating">評価</MenuItem>
            </Select>
          </FormControl>

          {/* ソート順序のセレクトボックス */}
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel id="sort-order-label" size="small">順序</InputLabel>
            <Select
              labelId="sort-order-label"
              id="sort-order-select"
              value={sortOrder}
              label="順序"
              onChange={handleSortOrderChange}
              size="small"
            >
              <MenuItem value="desc">降順</MenuItem>
              <MenuItem value="asc">昇順</MenuItem>
            </Select>
          </FormControl>

        </Box>
      </Box>

      {/* エラーメッセージ表示 */}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      
      {/* ロード中または画像がない場合の表示 */}
      {loading && images.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
      ) : (
        <>
          {/* ページネーション上部の件数表示とページネーションコンポーネント */}
          <Box sx={{ display: 'flex', flexDirection: 'column', mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="body1">
                {(totalSearchResults || 0).toLocaleString()} 件 / {(totalDatabaseCount || 0).toLocaleString()} 件
              </Typography>
            </Box>
            {/* 総検索結果が0より大きい場合のみページネーションを表示 */}
            {totalSearchResults !== null && totalSearchResults > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Pagination count={totalPages} page={currentPage} onChange={handlePageChange} size="small" />
              </Box>
            )}
          </Box>
          
          {/* 画像グリッド表示 */}
          {images.length > 0 ? (
            <Grid container spacing={1}>
              {images.map((image: any) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={image.id}>
                  <Card sx={{ position: 'relative', cursor: 'pointer' }} onClick={() => handleOpenModal(image)}>
                    <CardMedia
                      component="img"
                      image={`http://localhost:8000/images/${image.image_path}`}
                      alt={image.filename}
                      sx={{ height: 300, objectFit: 'cover' }}
                    />
    
                    {/* 画像サムネイル上の評価表示 */}
                    <Box sx={{ 
                      position: 'absolute', 
                      bottom: 0, 
                      right: 0, 
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      borderRadius: '4px 0 0 0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      p: 0.5 
                    }}>
                      <Rating
                        name={`rating-${image.id}`}
                        value={image.rating || 0}
                        precision={1}
                        onChange={(event, newRating) => {
                          event.stopPropagation(); // 親要素のonClick（モーダル表示）を防ぐ
                          handleRatingChange(image.id, newRating);
                        }}
                        emptyIcon={<StarBorderIcon fontSize="inherit" style={{ color: 'white' }} />}
                        sx={{ p: 0 }}
                      />
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            // 画像が見つからない場合のメッセージ
            <Typography variant="body1" sx={{ mt: 1, textAlign: 'center' }}>
              画像が見つかりません。画像を同期してみてください。
            </Typography>
          )}

          {/* ページネーション下部の件数表示とページネーションコンポーネント */}
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="body1">
                {(totalSearchResults || 0).toLocaleString()} 件 / {(totalDatabaseCount || 0).toLocaleString()} 件
              </Typography>
            </Box>
            {/* 総検索結果が0より大きい場合のみページネーションを表示 */}
            {totalSearchResults !== null && totalSearchResults > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Pagination count={totalPages} page={currentPage} onChange={handlePageChange} size="small" />
              </Box>
            )}
          </Box>
        </>
      )}

      {/* 画像詳細モーダル */}
      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
        {/* モーダルを閉じるボタン */}
        <IconButton
          aria-label="close"
          onClick={handleCloseModal}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: (theme) => theme.palette.grey[500],
            zIndex: 1,
          }}
        >
          <CloseIcon />
        </IconButton>
        <DialogContent dividers sx={{ position: 'relative' }}> {/* 相対位置指定のためposition: 'relative' */}
          {selectedImage && (
            <>
              {/* 前の画像へのナビゲーションボタン */}
              <IconButton
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)', // 垂直中央寄せ
                  zIndex: 2, // 他の要素より手前に表示
                  bgcolor: 'rgba(255,255,255,0.7)', // 半透明の背景
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } // ホバー時の背景色
                }}
                onClick={() => handleNavigateImage('prev')}
                disabled={images.findIndex(img => img.id === selectedImage.id) === 0 && currentPage === 1} // 最初の画像かつ1ページ目の場合無効化
                size="large"
              >
                <ArrowBackIosIcon />
              </IconButton>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* 詳細表示される画像 */}
                <img 
                  src={`http://localhost:8000/images/${selectedImage.image_path}`} 
                  alt={selectedImage.filename} 
                  style={{ 
                    maxWidth: '100%', 
                    maxHeight: '70vh',
                    objectFit: 'contain',
                    marginBottom: '16px'
                  }} 
                />
                {/* ファイルパス表示と削除アイコン */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
                  <Typography variant="body2" color="textSecondary" sx={{ wordBreak: 'break-all' }}>
                    **ファイルパス:** {selectedImage.image_path}
                  </Typography>
                  <IconButton 
                    color="error" 
                    size="small" 
                    onClick={handleDeleteIconClick}
                    sx={{ ml: 1 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
                {/* 生成パラメータの表示 */}
                {renderMetaData(selectedImage)}
              </Box>

              {/* 次の画像へのナビゲーションボタン */}
              <IconButton
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)', // 垂直中央寄せ
                  zIndex: 2, // 他の要素より手前に表示
                  bgcolor: 'rgba(255,255,255,0.7)', // 半透明の背景
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } // ホバー時の背景色
                }}
                onClick={() => handleNavigateImage('next')}
                disabled={images.findIndex(img => img.id === selectedImage.id) === images.length - 1 && currentPage === totalPages} // 最後の画像かつ最後のページの場合無効化
                size="large"
              >
                <ArrowForwardIosIcon />
              </IconButton>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog
        open={openConfirmDeleteDialog}
        onClose={handleCancelDelete}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{"画像を削除しますか？"}</DialogTitle>
        <DialogContent>
          <Typography id="alert-dialog-description">
            この操作は元に戻せません。データベースのエントリとディスク上の画像ファイルが削除されます。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>キャンセル</Button>
          <Button onClick={handleConfirmDelete} color="error" autoFocus>
            削除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 新しい独立したプロンプト生成コンポーネントを配置 */}
      <PromptGenerator 
        open={openPromptDialog} 
        onClose={handleClosePromptDialog} 
        onGenerateAndCopy={handleGenerateAndCopyPrompt}
        onPromptFetchError={setSnackbarMessage}
      />
      
      {/* スナックバー（画面下部に表示される一時的な通知） */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000} // 3秒後に自動的に閉じる
        onClose={handleSnackbarClose}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} // 左下隅に表示
      />
    </Container>
  );
}

export default App;
