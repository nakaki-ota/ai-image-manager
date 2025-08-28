import { useState, useEffect } from 'react';
import './App.css';
import { 
  Container, Grid, Card, CardMedia, Typography, TextField, Button, Box, Rating, CircularProgress, Alert,
  Dialog, DialogContent, IconButton, Snackbar, Pagination, FormControl, InputLabel, Select, MenuItem,
  type SelectChangeEvent, DialogTitle, DialogActions 
} from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SyncIcon from '@mui/icons-material/Sync';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete'; 
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'; // 左矢印アイコンを追加
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'; // 右矢印アイコンを追加

const API_URL = "http://localhost:8000/api";

interface ImageMetaData {
  id: number;
  filename: string;
  image_path: string;
  parameters: string;
  search_text: string;
  rating: number;
}

interface ImagesResponse {
    images: ImageMetaData[];
    total_search_results_count: number;
    total_database_count: number;
}

function App() {
  const [images, setImages] = useState<ImageMetaData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageMetaData | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [totalSearchResults, setTotalSearchResults] = useState<number | null>(null);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState<number | null>(null);
  
  const [imagesPerPage, setImagesPerPage] = useState<number>(25);

  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<string>('desc');

  const [openConfirmDeleteDialog, setOpenConfirmDeleteDialog] = useState(false);


  const fetchImages = async (query = '', page = 1, limit = imagesPerPage) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) {
        params.append('query', query);
      }
      params.append('page', String(page));
      params.append('limit', String(limit));
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);
      
      const url = `${API_URL}/images?${params.toString()}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data: ImagesResponse = await response.json();
      
      setImages(data.images);
      setTotalSearchResults(data.total_search_results_count);
      setTotalDatabaseCount(data.total_database_count);
      setCurrentPage(page);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchImageDetail = async (imageId: number) => {
    try {
      const url = `${API_URL}/images/${imageId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch image detail');
      }
      const data: ImageMetaData = await response.json();
      return data;
    } catch (err: any) {
      console.error("Failed to fetch image detail:", err);
      setError("Failed to load image details.");
      return null;
    }
  };

  useEffect(() => {
    fetchImages('', 1, imagesPerPage);
  }, [imagesPerPage, sortBy, sortOrder]);

  const handleSearch = () => {
    fetchImages(searchQuery, 1, imagesPerPage);
  };

  const handleRatingChange = async (imageId: number, newRating: number | null) => {
    if (newRating === null) return;
    
    try {
      const response = await fetch(`${API_URL}/images/${imageId}/rate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating: newRating }),
      });
      if (!response.ok) {
        throw new Error('Rating update failed');
      }
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

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/images/sync`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to sync images');
      }
      const data = await response.json();
      await fetchImages(searchQuery, 1, imagesPerPage);
      setSnackbarMessage(data.message);
      setSnackbarOpen(true);
    } catch (err: any) {
      console.error('Failed to sync images:', err);
      setError('Failed to sync images. Check server logs for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async (image: ImageMetaData) => {
    const detail = await fetchImageDetail(image.id);
    if (detail) {
      setSelectedImage(detail);
      setOpenModal(true);
    }
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedImage(null);
    setOpenConfirmDeleteDialog(false);
  };

  const handleCopyMetaData = (metaData: string) => {
    navigator.clipboard.writeText(metaData)
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

  const handleSnackbarClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    fetchImages(searchQuery, value, imagesPerPage);
  };

  const handleImagesPerPageChange = (event: SelectChangeEvent<number>) => {
    const newLimit = event.target.value as number;
    setImagesPerPage(newLimit);
    fetchImages(searchQuery, 1, newLimit);
  };

  const handleSortByChange = (event: SelectChangeEvent<string>) => {
    setSortBy(event.target.value as string);
    setCurrentPage(1);
  };

  const handleSortOrderChange = (event: SelectChangeEvent<string>) => {
    setSortOrder(event.target.value as string);
    setCurrentPage(1);
  };

  const handleDeleteIconClick = () => {
    setOpenConfirmDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedImage) {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/images/${selectedImage.id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error('ファイルの削除に失敗しました。');
        }
        setSnackbarMessage('画像とデータベースエントリを削除しました。');
        setSnackbarOpen(true);
        handleCloseModal();
        await fetchImages(searchQuery, currentPage, imagesPerPage); 
      } catch (err: any) {
        console.error('画像の削除に失敗:', err);
        setError(`削除エラー: ${err.message}`);
        setSnackbarMessage('削除に失敗しました。');
        setSnackbarOpen(true);
      } finally {
        setLoading(false);
        setOpenConfirmDeleteDialog(false);
      }
    }
  };

  const handleCancelDelete = () => {
    setOpenConfirmDeleteDialog(false);
  };

  // --- 前後の画像にナビゲートする関数を追加 ---
  const handleNavigateImage = async (direction: 'prev' | 'next') => {
    if (!selectedImage) return;

    const currentIndex = images.findIndex(img => img.id === selectedImage.id);
    if (currentIndex === -1) return; // 現在の画像がリストに見つからない場合

    let newIndex = currentIndex;
    if (direction === 'prev') {
      newIndex = currentIndex - 1;
    } else {
      newIndex = currentIndex + 1;
    }

    // ページをまたぐナビゲーションの処理（簡易版）
    // 実際にはAPIを再呼び出しして、前後のページの画像をフェッチする必要がある
    // この例では、現在のページ内の画像のみを対象とします
    if (newIndex >= 0 && newIndex < images.length) {
      const nextImage = images[newIndex];
      const detail = await fetchImageDetail(nextImage.id);
      if (detail) {
        setSelectedImage(detail);
      }
    } else {
      // 現在のページの前/次の画像がない場合、ページを移動して画像をフェッチする
      let newPage = currentPage;
      if (direction === 'prev' && currentPage > 1) {
        newPage = currentPage - 1;
      } else if (direction === 'next' && currentPage < totalPages) {
        newPage = currentPage + 1;
      }

      if (newPage !== currentPage) {
        await fetchImages(searchQuery, newPage, imagesPerPage);
        // 新しいページがロードされた後、適切な画像を再度選択する必要がある
        // ここでは、新しいページの最初/最後の画像を選択する簡易的な実装
        const newImages = await (await fetch(`${API_URL}/images?query=${searchQuery}&page=${newPage}&limit=${imagesPerPage}&sort_by=${sortBy}&sort_order=${sortOrder}`)).json();
        if (newImages.images.length > 0) {
          const targetImage = direction === 'prev' ? newImages.images[newImages.images.length - 1] : newImages.images[0];
          const detail = await fetchImageDetail(targetImage.id);
          if (detail) {
            setSelectedImage(detail);
            setCurrentPage(newPage);
          }
        }
      }
    }
  };

  const totalPages = Math.ceil((totalSearchResults || 0) / imagesPerPage); 

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

  return (
    <Container sx={{ pt: 2, pb: 2 }}>
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
          <TextField
            label="Search images..."
            variant="outlined"
            fullWidth
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            sx={{ height: '40px' }}
          >
            検索
          </Button>
          <Button
            variant="contained"
            onClick={handleSync}
            disabled={loading}
            startIcon={<SyncIcon />}
            sx={{ height: '40px', minWidth: '90px' }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '同期'}
          </Button>
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

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      
      {loading && images.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
      ) : (
        <>
          {/* ページネーション上部の件数表示 - 修正済み */}
          <Box sx={{ display: 'flex', flexDirection: 'column', mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="body1">
                {(totalSearchResults || 0).toLocaleString()} 件 / {(totalDatabaseCount || 0).toLocaleString()} 件
              </Typography>
            </Box>
            {totalSearchResults !== null && totalSearchResults > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Pagination count={totalPages} page={currentPage} onChange={handlePageChange} size="small" />
              </Box>
            )}
          </Box>
          
          {images.length > 0 ? (
            <Grid container spacing={1}>
              {images.map((image: any) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={image.id}>
                  <Card sx={{ position: 'relative', cursor: 'pointer' }} onClick={() => handleOpenModal(image)}>
                    <CardMedia
                      component="img"
                      image={`http://localhost:8000/images/${image.image_path}`}
                      alt={image.filename}
                      sx={{ height: 200, objectFit: 'cover' }}
                    />
    
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
                          event.stopPropagation();
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
            <Typography variant="body1" sx={{ mt: 1, textAlign: 'center' }}>
              画像が見つかりません。画像を同期してみてください。
            </Typography>
          )}

          {/* ページネーション下部の件数表示 - 修正済み */}
          <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="body1">
                {(totalSearchResults || 0).toLocaleString()} 件 / {(totalDatabaseCount || 0).toLocaleString()} 件
              </Typography>
            </Box>
            {totalSearchResults !== null && totalSearchResults > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Pagination count={totalPages} page={currentPage} onChange={handlePageChange} size="small" />
              </Box>
            )}
          </Box>
        </>
      )}

      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
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
        <DialogContent dividers sx={{ position: 'relative' }}> {/* position: 'relative' を追加 */}
          {selectedImage && (
            <>
              {/* 前の画像へのナビゲーションボタン */}
              <IconButton
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2,
                  bgcolor: 'rgba(255,255,255,0.7)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                }}
                onClick={() => handleNavigateImage('prev')}
                disabled={images.findIndex(img => img.id === selectedImage.id) === 0 && currentPage === 1} // 最初の画像かつ1ページ目の場合無効
                size="large"
              >
                <ArrowBackIosIcon />
              </IconButton>

              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
                {renderMetaData(selectedImage)}
              </Box>

              {/* 次の画像へのナビゲーションボタン */}
              <IconButton
                sx={{
                  position: 'absolute',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 2,
                  bgcolor: 'rgba(255,255,255,0.7)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' }
                }}
                onClick={() => handleNavigateImage('next')}
                disabled={images.findIndex(img => img.id === selectedImage.id) === images.length - 1 && currentPage === totalPages} // 最後の画像かつ最後のページの場合無効
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


      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
    </Container>
  );
}

export default App;
